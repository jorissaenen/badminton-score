package it.skoor.wear

import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

// A card over the score for a moment: NOT COUNTED (orange), INTERVAL or CHANGE ENDS (green).
data class Card(val title: String, val line: String, val kind: Kind, val until: Long) {
    enum class Kind { REFUSED, ALERT }
}

// One match being scored on this watch. The watch only scores while it's sure it has the latest
// score (LIVE); every press says which version of the score it was made on, the server counts the
// first press only and freezes the score for 5 seconds after a point (undo still works).
class Session(
    private val api: Api,
    private val store: Store,
    private val haptics: Haptics,
    first: Summary,
    private val onUnlinked: () -> Unit,
    private val onGone: () -> Unit,
) {
    var s by mutableStateOf(first)
        private set
    var card by mutableStateOf<Card?>(null)
        internal set // also by the screenshot tests
    var busy by mutableStateOf(false)
        private set
    // Ticks once a second while something on screen moves (the frozen bar, a card, LIVE turning
    // OFFLINE): the screen redraws only then.
    var now by mutableLongStateOf(clock())
        private set

    private var lastOk = clock()
    private var frozenUntil = clock() + first.frozenMs
    private val pace = Pace(first.pointMs ?: 18_000, clock())
    private var paced = first.pointMs != null
    private var wait = 3_000L
    private var nextCheck = 0L
    private var checking = false
    private var job: Job? = null

    val live get() = lastOk > 0 && api.connected() && clock() - lastOk < wait + 6_000
    val frozenLeft get() = (frozenUntil - now).coerceAtLeast(0)

    // The team on top (and on the top button / top half): your own team when you play and "My team
    // on top" is on, else team 1.
    val top get() = if (store.myUp && s.mine == 1) 1 else 0

    // Runs while the score is on screen (stopped when the watch leaves the app: no checks then).
    fun start(scope: CoroutineScope) {
        job?.cancel()
        job = scope.launch {
            while (true) {
                val t = clock()
                if (t >= nextCheck) check()
                val moving = frozenUntil > t - 1_000 || (card?.until ?: 0) > t - 1_000
                if (moving || live != wasLive) {
                    wasLive = live
                    now = t
                }
                delay(1_000)
            }
        }
    }

    private var wasLive = true

    fun stop() {
        job?.cancel()
        job = null
    }

    private suspend fun check() {
        if (checking || busy) return
        wait = pace.waitMs(clock(), s)
        nextCheck = clock() + wait
        if (!api.connected()) return
        checking = true
        val params = mutableMapOf("club" to s.club, "match" to s.match)
        if (!paced) params["pace"] = "1"
        val a = api.get("/match", params)
        checking = false
        when {
            a.ok -> {
                val d = Summary.from(a.json!!)
                if (!paced && d.pointMs != null) {
                    pace.pointMs = d.pointMs
                    paced = true
                }
                take(d)
            }
            a.code == 401 -> onUnlinked()
            a.code == 404 -> onGone()
        }
        now = clock()
    }

    // A newer (or the same) score from the server.
    private fun take(d: Summary) {
        if (d.version > s.version) {
            if (store.alerts) alertFor(s, d)?.let { (title, line) ->
                card = Card(title, line, Card.Kind.ALERT, clock() + 5_000)
                haptics.game()
            }
            if (d.lastAction.startsWith("point")) pace.learn(clock()) else pace.reset(clock())
        }
        if (d.version >= s.version) s = d
        lastOk = clock()
        frozenUntil = clock() + d.frozenMs
    }

    // A point for the team on top (true) or below.
    fun point(onTop: Boolean, scope: CoroutineScope) = press("point${if (onTop) top else 1 - top}", scope)

    // 'point0', 'point1', 'undo' or 'next'. Every press gets an answer at once when it can't be
    // sent: no connection, the last press still on its way, or not sure of the latest score.
    fun press(action: String, scope: CoroutineScope) {
        when {
            !api.connected() -> return refuse("No connection: phone or Wi-Fi?")
            busy -> return refuse("Still sending your last press")
            !live -> return refuse("Scoring paused: checking the score")
        }
        busy = true
        scope.launch {
            val body = JSONObject().put("club", s.club).put("match", s.match).put("basedOn", s.version).put("action", action)
            val a = api.post("/press", body)
            busy = false
            when {
                a.ok -> {
                    val j = a.json!!
                    take(Summary.from(j))
                    if (j.optBoolean("counted")) {
                        card = null
                        when {
                            s.matchWinner != null -> haptics.done()
                            s.gameOver -> haptics.game()
                            else -> haptics.point()
                        }
                    } else {
                        refuse(reason(j.optString("reason"), j.optString("by"), s))
                    }
                }
                a.code == 401 -> onUnlinked()
                else -> {
                    lastOk = 0 // no answer: not live until the next one
                    refuse(problem(a.code))
                }
            }
            now = clock()
        }
    }

    private fun refuse(text: String) {
        card = Card("NOT COUNTED", text, Card.Kind.REFUSED, clock() + 2_600)
        haptics.refused()
        now = clock()
    }

    companion object {
        fun clock() = SystemClock.elapsedRealtime()
    }
}
