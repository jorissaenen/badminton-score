package it.skoor.wear

import androidx.compose.runtime.Composable
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// Pictures of every screen on a round watch (227 dp, like a Galaxy Watch), drawn on a computer:
// app/build/screens/*.png. Run: ./gradlew testDebugUnitTest
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w227dp-h227dp-round-xhdpi")
class ScreensTest {
    private val context get() = ApplicationProvider.getApplicationContext<android.content.Context>()

    private fun summary(extra: String = "") = Summary.from(JSONObject("""{
        "club": "c1", "match": "m1", "version": 4, "court": 2, "bestOf": 3,
        "home": "Joris Saenen & Maarten Loyens", "away": "Mathias & Lennart", "tiles": ["07", "11"],
        "server": 1, "won": [1, 0], "past": [[21, 17]], "gameNo": 2, "gameOver": false,
        "gameWinner": null, "matchWinner": null, "frozenMs": 3000, "lastBy": "", "lastAction": "point1",
        "mine": 0, "ends": true, "interval": false $extra }"""))

    private fun session(s: Summary): Session {
        val store = Store(context)
        // Connected, so the pictures show the score live (no network on a computer).
        val api = object : Api(context, store) { override fun connected() = true }
        return Session(api, store, Haptics(context), s, onUnlinked = {}, onGone = {})
    }

    private fun shot(name: String, content: @Composable () -> Unit) = captureRoboImage("build/screens/$name.png") { content() }

    @Test
    fun screens() {
        shot("1-link") { LinkContent("K7M2QX", List(25) { r -> (0 until 25).joinToString("") { c -> if ((r * 7 + c * 3) % 5 < 2 || (r < 7 && c < 7)) "1" else "0" } }, "") }
        shot("2-matches") { MatchesContent(listOf(summary(), summary().copy(court = 3, home = "Ann & Koen", away = "Lies & Tom", tiles = listOf("20", "19"))), "", {}, {}) }
        shot("3-score") { ScoreScreen(session(summary()), touch = true, onMenu = {}, onDone = {}) }
        val refused = session(summary()).also { it.card = Card("NOT COUNTED", "Ann was first · 7–11", Card.Kind.REFUSED, Long.MAX_VALUE) }
        shot("4-refused") { ScoreScreen(refused, touch = true, onMenu = {}, onDone = {}) }
        val interval = session(summary()).also { it.card = Card("INTERVAL", "Change ends", Card.Kind.ALERT, Long.MAX_VALUE) }
        shot("5-interval") { ScoreScreen(interval, touch = true, onMenu = {}, onDone = {}) }
        shot("6-game-won") { ScoreScreen(session(summary().copy(tiles = listOf("21", "15"), gameOver = true, gameWinner = 0, won = listOf(1, 1), gameNo = 2)), true, {}, {}) }
        shot("7-match-won") { ScoreScreen(session(summary().copy(tiles = listOf("21", "18"), past = listOf(listOf(21, 17), listOf(19, 21)), gameOver = true, gameWinner = 0, matchWinner = 0, gameNo = 3)), true, {}, {}) }
        shot("8-menu") { MenuScreen(Store(context), inMatch = true, {}, {}, {}, {}) }
    }
}
