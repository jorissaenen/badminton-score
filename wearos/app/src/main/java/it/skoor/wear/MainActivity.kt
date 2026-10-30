package it.skoor.wear

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.currentBackStackEntryAsState
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController

// Skoor on a Wear OS watch: link it once to your account (QR code or key), then pick a match being
// played in your clubs and keep its score, together with phones and other watches.
//
// Buttons while scoring (watches with extra buttons): the top button gives the team on top a
// point, the bottom button the team below; holding either undoes. A watch with one extra button:
// press for the team on top, press twice quickly for the team below, hold to undo. The crown or
// bezel only scrolls lists and menus: while scoring it does nothing.
class MainActivity : ComponentActivity() {
    private lateinit var store: Store
    private lateinit var api: Api
    private lateinit var haptics: Haptics
    private var session by mutableStateOf<Session?>(null)
    private var scoring = false // the score is on screen: the buttons score
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = Store(this)
        api = Api(this, store)
        haptics = Haptics(this)
        setContent {
            MaterialTheme {
                val nav = rememberSwipeDismissableNavController()
                val route = nav.currentBackStackEntryAsState().value?.destination?.route
                val unlinked = {
                    store.token = null
                    session?.stop()
                    session = null
                    nav.navigate("link") { popUpTo(0) }
                }
                // Swiping back is off while scoring (a swipe in the heat of a rally shouldn't leave the
                // match); the back gesture opens the menu there instead.
                SwipeDismissableNavHost(nav, startDestination = if (store.token == null) "link" else "matches", userSwipeEnabled = route != "score") {
                    composable("link") {
                        LinkScreen(api, store, haptics) { nav.navigate("matches") { popUpTo(0) } }
                    }
                    composable("matches") {
                        MatchesScreen(api, onOpen = { m ->
                            session?.stop()
                            session = Session(api, store, haptics, m, onUnlinked = unlinked, onGone = { nav.popBackStack("matches", false) })
                            nav.navigate("score")
                        }, onSettings = { nav.navigate("settings") }, onUnlinked = unlinked)
                    }
                    composable("score") {
                        val s = session ?: return@composable
                        DisposableEffect(s) {
                            scoring = true
                            s.start(lifecycleScope)
                            if (store.keepOn) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            onDispose {
                                scoring = false
                                s.stop()
                                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            }
                        }
                        BackHandler { nav.navigate("menu") }
                        ScoreScreen(s, store.touch, onMenu = { nav.navigate("menu") }, onDone = { nav.popBackStack("matches", false) })
                    }
                    composable("menu") {
                        MenuScreen(store, inMatch = true,
                            onUndo = { nav.popBackStack(); session?.press("undo", lifecycleScope) },
                            onOtherMatch = { nav.popBackStack("matches", false) },
                            onClose = { finish() }, // the match goes on for the others
                            onUnlink = unlinked)
                    }
                    composable("settings") {
                        MenuScreen(store, inMatch = false, onUndo = {}, onOtherMatch = {}, onClose = {}, onUnlink = unlinked)
                    }
                }
            }
        }
    }

    // No checks while the watch shows something else (or the screen is off): they cost battery.
    override fun onStart() {
        super.onStart()
        if (scoring) session?.start(lifecycleScope)
    }

    override fun onStop() {
        super.onStop()
        session?.stop()
    }

    // ---------- the buttons ----------

    private val stemKeys = setOf(KeyEvent.KEYCODE_STEM_1, KeyEvent.KEYCODE_STEM_2, KeyEvent.KEYCODE_STEM_3)
    private val oneButton by lazy { !KeyCharacterMap.deviceHasKey(KeyEvent.KEYCODE_STEM_2) }
    private var held = false
    private var pendingSingle: Runnable? = null

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (!scoring || keyCode !in stemKeys) return super.onKeyDown(keyCode, event)
        if (event.repeatCount == 0) {
            held = false
            event.startTracking() // to hear a long press
        }
        return true
    }

    override fun onKeyLongPress(keyCode: Int, event: KeyEvent): Boolean {
        if (!scoring || keyCode !in stemKeys) return super.onKeyLongPress(keyCode, event)
        held = true
        session?.press("undo", lifecycleScope)
        return true
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (!scoring || keyCode !in stemKeys) return super.onKeyUp(keyCode, event)
        if (held || event.isCanceled) return true
        val s = session ?: return true
        if (!oneButton) {
            s.point(keyCode == KeyEvent.KEYCODE_STEM_1, lifecycleScope)
            return true
        }
        // One button: once for the team on top, twice quickly for the team below.
        val single = pendingSingle
        if (single != null) {
            handler.removeCallbacks(single)
            pendingSingle = null
            s.point(false, lifecycleScope)
        } else {
            val r = Runnable { pendingSingle = null; s.point(true, lifecycleScope) }
            pendingSingle = r
            handler.postDelayed(r, 350)
        }
        return true
    }
}
