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

        // Starting a game on the watch.
        shot("9-home") { HomeContent(2, {}, {}, {}) }
        val sports = listOf(
            Sport("badminton", "Badminton", false, listOf("To 21 · best of 3")), Sport("padel", "Padel", false, listOf("Best of 3 sets")),
            Sport("basketball", "Basketball", true, listOf("4 × 10 min", "2 × 20 min", "4 × 12 min")), Sport("football", "Football", true, listOf("2 × 45 min")),
        )
        shot("10-sport") { SportContent(sports, "", {}) }
        val game = GameSetup(sports[2]).also {
            it.takePeople(listOf(Person("joris", "Joris Saenen", true), Person("ann", "Ann V.", false), Person("tom", "Tom P.", false), Person("lien", "Lien P.", false)))
            it.toggle(0, "ann")
        }
        shot("11-setup") { SetupContent(game, busy = false, problem = null, onTeam = {}, onStart = {}) }
        shot("12-team") { TeamScreen(game, 0) }

        // A timed game.
        shot("13-timed") { TimedScreen(timed(""), {}, {}, {}) }
        shot("14-paused") { TimedScreen(timed(""", "running": false"""), {}, {}, {}) }
        shot("15-points") { PointsScreen(timed("").g, 0, 1, {}, {}) }
        shot("16-half-time") { TimedScreen(timed(""", "running": false, "periodOver": true, "leftMs": 0"""), {}, {}, {}) }
        shot("17-finished") { TimedScreen(timed(""", "running": false, "finished": true, "winner": 0, "period": 4, "past": [[22, 18], [26, 27], [20, 15]], "score": [88, 78]"""), {}, {}, {}) }
    }

    private fun timed(extra: String): TimedSession {
        val j = JSONObject("""{ "kind": "timed", "club": "", "match": "g1", "version": 9, "home": "Home", "away": "Away",
            "score": [48, 45], "values": [1, 2, 3], "usual": 2, "period": 2, "periods": 4, "leftMs": 462000,
            "running": true, "periodOver": false, "finished": false, "winner": null, "past": [[22, 18]] }""")
        val more = JSONObject("{" + extra.trimStart(',', ' ') + "}")
        more.keys().forEach { j.put(it, more.get(it)) }
        val store = Store(context)
        val api = object : Api(context, store) { override fun connected() = true }
        return TimedSession(api, Haptics(context), TimedGame.from(j), onUnlinked = {}, onGone = {})
    }
}
