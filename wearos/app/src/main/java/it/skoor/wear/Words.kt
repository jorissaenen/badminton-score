package it.skoor.wear

// The texts the watch shows, in plain words (never codes or numbers from the system).

// Why a press didn't count, as the server says it (functions/watch.js, press()).
fun reason(why: String, by: String, s: Summary): String {
    val score = "${plain(s.tiles[0])}–${plain(s.tiles[1])}"
    val known = by.isNotBlank()
    return when (why) {
        "stale" -> if (known) "$by was first · $score" else "Score had just changed · $score"
        "frozen" -> if (known) "$by just scored · $score" else "Frozen 5 s after a point"
        "over" -> "The match is over"
        "gameover" -> "Game over: next game first"
        "nothing" -> "Nothing to undo"
        else -> "Not now"
    }
}

// A request that got no (good) answer.
fun problem(code: Int): String = when {
    code == Api.NO_CONNECTION -> "No connection: phone or Wi-Fi?"
    code == Api.TIMED_OUT -> "No answer: is your phone online?"
    code < 0 -> "No connection right now"
    else -> "Skoor can't be reached right now"
}

// The interval (at 11) or a change of ends between two scores, as a title and a line; null if
// neither. A change of ends with the next game counts too.
fun alertFor(was: Summary, now: Summary): Pair<String, String>? {
    if (now.gameOver) return null
    val ends = now.ends != was.ends
    return when {
        now.interval -> "INTERVAL" to (if (ends) "Change ends" else "60 seconds")
        ends -> "CHANGE ENDS" to "Teams switch sides"
        else -> null
    }
}
