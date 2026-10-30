package it.skoor.wear

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LogicTest {
    // A summary as functions/watch.js sends it.
    private fun summary(extra: String = "") = Summary.from(JSONObject("""{
        "club": "c1", "match": "m1", "version": 4, "status": "live", "court": 2, "bestOf": 3,
        "home": "Joris Saenen & Maarten Loyens", "away": "Mathias & Lennart", "tiles": ["07", "11"],
        "server": 1, "won": [1, 0], "past": [[21, 17]], "gameNo": 2, "gameOver": false,
        "gameWinner": null, "matchWinner": null, "frozenMs": 0, "lastBy": "", "lastAction": "point1",
        "mine": 0, "ends": true, "interval": false $extra }"""))

    @Test
    fun readsTheServersAnswer() {
        val s = summary()
        assertEquals(2, s.court)
        assertEquals(listOf(listOf(21, 17), listOf(7, 11)), s.allGames())
        assertNull(s.matchWinner)
        assertNull(s.pointMs)
        assertEquals(12_000L, summary(""", "pointMs": 12000""").pointMs)
    }

    @Test
    fun namesAndTiles() {
        assertEquals("7", plain("07"))
        assertEquals("11", plain("11"))
        assertEquals("AD", plain("AD"))
        assertEquals("Joris & Maarten", firstNames("Joris Saenen & Maarten Loyens"))
        assertEquals("Ann", firstNames("Ann"))
    }

    @Test
    fun pressesThatDontCountSayWhy() {
        val s = summary()
        assertEquals("Ann was first · 7–11", reason("stale", "Ann", s))
        assertEquals("Score had just changed · 7–11", reason("stale", "", s))
        assertEquals("Ann just scored · 7–11", reason("frozen", "Ann", s))
        assertEquals("No connection: phone or Wi-Fi?", problem(Api.NO_CONNECTION))
        assertEquals("Skoor can't be reached right now", problem(503))
    }

    @Test
    fun intervalAndChangeOfEnds() {
        val was = summary()
        assertNull(alertFor(was, was))
        assertEquals("INTERVAL" to "Change ends", alertFor(was, was.copy(ends = false, interval = true)))
        assertEquals("INTERVAL" to "60 seconds", alertFor(was, was.copy(interval = true)))
        assertEquals("CHANGE ENDS" to "Teams switch sides", alertFor(was, was.copy(ends = false)))
        assertNull(alertFor(was, was.copy(ends = false, gameOver = true)), "the game-won screen says it")
    }

    @Test
    fun asksWhenAPointIsLikely() {
        val s = summary()
        val pace = Pace(pointMs = 18_000, lastPoint = 100_000)
        assertEquals("waits in the freeze and until 60% of the pace", 10_000L, pace.waitMs(100_000 + 800, s))
        assertEquals("asks often in the window of the next point", 2_500L, pace.waitMs(100_000 + 15_000, s))
        assertEquals("slows down when play stops", 6_000L, pace.waitMs(100_000 + 40_000, s))
        assertEquals(12_000L, pace.waitMs(100_000 + 200_000, s))
        assertEquals("calm between games", 15_000L, pace.waitMs(100_000 + 10_000, s.copy(gameOver = true)))
        assertEquals("near the end of the interval", 4_000L, pace.waitMs(100_000 + 50_000, s.copy(interval = true)))
        assertEquals("after the match", 20_000L, pace.waitMs(100_000, s.copy(matchWinner = 0)))
    }

    @Test
    fun learnsThePace() {
        val pace = Pace(pointMs = 18_000, lastPoint = 0)
        pace.learn(1_000) // the first point seen: nothing to learn from yet
        assertEquals(18_000L, pace.pointMs)
        pace.learn(11_000) // 10 s later
        assertEquals(15_600L, pace.pointMs)
        pace.learn(11_000 + 120_000) // two minutes: a break, left out
        assertEquals(15_600L, pace.pointMs)
    }
}

private fun <T> assertNull(value: T?, message: String) = org.junit.Assert.assertNull(message, value)
