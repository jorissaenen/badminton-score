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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.currentBackStackEntryAsState
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController

// Skoor on a Wear OS watch: link it once to your account (QR code or key), then start a game of
// your own (any sport, also timed ones like basketball), or pick a match being played in your
// clubs and keep its score, together with phones and other watches.
//
// Buttons while scoring (watches with extra buttons): the top button gives the team on top (in a
// timed game HOME) a point, the bottom button the team below (AWAY); holding either undoes. A watch with one extra button:
// press for the team on top, press twice quickly for the team below, hold to undo. The crown or
// bezel only scrolls lists and menus: while scoring it does nothing.
class MainActivity : ComponentActivity() {
    private lateinit var store: Store
    private lateinit var api: Api
    private lateinit var haptics: Haptics
    private var session by mutableStateOf<Session?>(null)
    private var timed by mutableStateOf<TimedSession?>(null)
    private var game by mutableStateOf<GameSetup?>(null) // a new game being set up
    private var scoring = false // the score is on screen: the buttons score
    private var timedOn = false // a timed game is on screen: the buttons score in it
    private var pointFor: (Int) -> Unit = {} // a point in the timed game (basketball: choose 1, 2 or 3 first)
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
                    timed?.stop()
                    timed = null
                    nav.navigate("link") { popUpTo(0) }
                }
                // A game or match to score: a timed game, or one counted in points. fromSetup: in
                // place of the sport and the setup, so that leaving it leads to the start.
                val open = { j: org.json.JSONObject, fromSetup: Boolean ->
                    session?.stop()
                    timed?.stop()
                    val route = if (j.optString("kind") == "timed") {
                        timed = TimedSession(api, haptics, TimedGame.from(j), onUnlinked = unlinked, onGone = { nav.popBackStack("home", false) })
                        "timed"
                    } else {
                        session = Session(api, store, haptics, Summary.from(j), onUnlinked = unlinked, onGone = { nav.popBackStack("home", false) })
                        "score"
                    }
                    nav.navigate(route) { if (fromSetup) popUpTo("home") }
                }
                // Swiping back is off while scoring (a swipe in the heat of a rally shouldn't leave the
                // match); the back gesture opens the menu there instead.
                SwipeDismissableNavHost(nav, startDestination = if (store.token == null) "link" else "home", userSwipeEnabled = route != "score" && route != "timed") {
                    composable("link") {
                        LinkScreen(api, store, haptics) { nav.navigate("home") { popUpTo(0) } }
                    }
                    composable("home") {
                        HomeScreen(api, onNewGame = { nav.navigate("sport") }, onMatches = { nav.navigate("matches") }, onSettings = { nav.navigate("settings") }, onUnlinked = unlinked)
                    }
                    composable("sport") {
                        SportScreen(api, onChoose = { s -> game = GameSetup(s); nav.navigate("setup") }, onUnlinked = unlinked)
                    }
                    composable("setup") {
                        val g = game ?: return@composable
                        SetupScreen(api, g, onTeam = { t -> nav.navigate("team/$t") }, onStarted = { j -> haptics.point(); open(j, true) }, onUnlinked = unlinked)
                    }
                    composable("team/{t}") { entry ->
                        val g = game ?: return@composable
                        TeamScreen(g, entry.arguments?.getString("t")?.toIntOrNull() ?: 0)
                    }
                    composable("matches") {
                        MatchesScreen(api, onOpen = { m -> m.raw?.let { open(it, false) } }, onSettings = { nav.navigate("settings") }, onUnlinked = unlinked)
                    }
                    composable("timed") {
                        val t = timed ?: return@composable
                        // A point: in basketball first the choice of 1, 2 or 3.
                        pointFor = { team -> if (t.g.values.size > 1) nav.navigate("points/$team") else t.press("point$team", lifecycleScope, t.g.values[0]) }
                        DisposableEffect(t) {
                            timedOn = true
                            t.start(lifecycleScope)
                            if (store.keepOn) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            onDispose {
                                timedOn = false
                                t.stop()
                                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            }
                        }
                        BackHandler { nav.navigate("timedmenu") }
                        TimedScreen(t, onPoint = { pointFor(it) }, onMenu = { nav.navigate("timedmenu") }, onDone = { nav.popBackStack("home", false) })
                    }
                    composable("points/{team}") { entry ->
                        val t = timed ?: return@composable
                        val team = entry.arguments?.getString("team")?.toIntOrNull() ?: 0
                        var picked by remember { mutableIntStateOf(usualIndex(t.g)) }
                        var counted by remember { mutableStateOf(false) }
                        PointsScreen(t.g, team, picked, onPick = { picked = it }) { n ->
                            if (!counted) {
                                counted = true
                                nav.popBackStack()
                                t.press("point$team", lifecycleScope, n)
                            }
                        }
                    }
                    composable("timedmenu") {
                        MenuScreen(store, inMatch = true,
                            onUndo = { nav.popBackStack(); timed?.press("undo", lifecycleScope) },
                            onOtherMatch = { nav.popBackStack("home", false) },
                            onClose = { finish() },
                            onUnlink = unlinked)
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
                        ScoreScreen(s, store.touch, onMenu = { nav.navigate("menu") }, onDone = { nav.popBackStack("home", false) })
                    }
                    composable("menu") {
                        MenuScreen(store, inMatch = true,
                            onUndo = { nav.popBackStack(); session?.press("undo", lifecycleScope) },
                            onOtherMatch = { nav.popBackStack("home", false) },
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
        if (timedOn) timed?.start(lifecycleScope)
    }

    override fun onStop() {
        super.onStop()
        session?.stop()
        timed?.stop()
    }

    // ---------- the buttons ----------

    private val stemKeys = setOf(KeyEvent.KEYCODE_STEM_1, KeyEvent.KEYCODE_STEM_2, KeyEvent.KEYCODE_STEM_3)
    private val oneButton by lazy { !KeyCharacterMap.deviceHasKey(KeyEvent.KEYCODE_STEM_2) }
    private var held = false
    private var pendingSingle: Runnable? = null

    private val buttonsScore get() = scoring || timedOn

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (!buttonsScore || keyCode !in stemKeys) return super.onKeyDown(keyCode, event)
        if (event.repeatCount == 0) {
            held = false
            event.startTracking() // to hear a long press
        }
        return true
    }

    override fun onKeyLongPress(keyCode: Int, event: KeyEvent): Boolean {
        if (!buttonsScore || keyCode !in stemKeys) return super.onKeyLongPress(keyCode, event)
        held = true
        if (timedOn) timed?.press("undo", lifecycleScope) else session?.press("undo", lifecycleScope)
        return true
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (!buttonsScore || keyCode !in stemKeys) return super.onKeyUp(keyCode, event)
        if (held || event.isCanceled) return true
        val point: (Boolean) -> Unit = { onTop ->
            if (timedOn) pointFor(if (onTop) 0 else 1) else session?.point(onTop, lifecycleScope)
        }
        if (!oneButton) {
            point(keyCode == KeyEvent.KEYCODE_STEM_1)
            return true
        }
        // One button: once for the team on top, twice quickly for the team below.
        val single = pendingSingle
        if (single != null) {
            handler.removeCallbacks(single)
            pendingSingle = null
            point(false)
        } else {
            val r = Runnable { pendingSingle = null; point(true) }
            pendingSingle = r
            handler.postDelayed(r, 350)
        }
        return true
    }
}
