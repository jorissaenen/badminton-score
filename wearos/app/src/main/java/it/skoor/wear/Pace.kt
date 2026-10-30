package it.skoor.wear

// When to ask the server for the score again. Every request wakes the watch's radio, the largest
// part of the battery the app uses, so it asks when a change is likely: it knows how long a point
// takes in this match (the server's estimate from the match and the players' earlier matches,
// then learnt from every point it sees). After a point it waits (the score is frozen for 5 s
// anyway), asks every 2.5 s in the window where the next point is expected (60–180% of the pace),
// then slows down when play stops; calm in the interval, between games and after the match.
// The same rules as the Garmin app (garmin/source/ScoreView.mc).
class Pace(var pointMs: Long = 18_000, var lastPoint: Long = 0) {

    // A point seen at `now`: learn how long points take here (leaving out breaks and long pauses).
    fun learn(now: Long) {
        val gap = now - lastPoint
        if (lastPoint > 0 && gap > 3_000 && gap < 3 * pointMs) pointMs = (pointMs * 7 + gap * 3) / 10
        lastPoint = now
    }

    // Something else changed (an undo, the next game): count from now, without learning.
    fun reset(now: Long) {
        lastPoint = now
    }

    fun waitMs(now: Long, s: Summary): Long {
        val since = now - lastPoint
        if (s.matchWinner != null) return 20_000 // only an undo can still come
        if (s.gameOver) return if (since < 90_000) 15_000 else 4_000 // two minutes between games
        if (s.interval) return if (since < 45_000) 10_000 else 4_000 // the 60-second interval
        val opens = maxOf(5_000, pointMs * 6 / 10) // never in the 5-second freeze after a point
        val closes = pointMs * 18 / 10
        return when {
            since < opens -> (opens - since).coerceIn(2_500, 10_000)
            since < closes -> 2_500
            since < 120_000 -> 6_000 // play stopped: a break, a long rally, a discussion
            else -> 12_000
        }
    }
}
