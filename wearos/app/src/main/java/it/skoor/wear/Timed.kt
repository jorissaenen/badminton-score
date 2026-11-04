package it.skoor.wear

import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Text
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

// A timed game (basketball, football) as the server describes it (functions/watch.js,
// timedSummary): the score, the period and the clock.
data class TimedGame(
    val club: String,
    val match: String,
    val version: Int,
    val home: String,
    val away: String,
    val score: List<Int>,
    val values: List<Int>,
    val usual: Int,
    val period: Int,
    val periods: Int,
    val leftMs: Long,
    val running: Boolean,
    val periodOver: Boolean,
    val finished: Boolean,
    val winner: Int?,
    val past: List<List<Int>>,
) {
    fun name(team: Int) = if (team == 0) home else away

    // "Q2", "1ST HALF".
    fun periodName(p: Int = period) = if (periods == 4) "Q$p" else when (p) { 1 -> "1ST HALF"; 2 -> "2ND HALF"; else -> "PERIOD $p" }

    // Every period played, this one last.
    fun byPeriod(): List<List<Int>> = past + listOf(listOf(score[0] - past.sumOf { it[0] }, score[1] - past.sumOf { it[1] }))

    companion object {
        private fun org.json.JSONArray.ints() = (0 until length()).map { getInt(it) }

        fun from(j: JSONObject) = TimedGame(
            club = j.getString("club"), match = j.getString("match"), version = j.optInt("version"),
            home = j.optString("home"), away = j.optString("away"),
            score = j.getJSONArray("score").ints(), values = j.getJSONArray("values").ints(), usual = j.optInt("usual", 1),
            period = j.optInt("period", 1), periods = j.optInt("periods", 2), leftMs = j.optLong("leftMs"),
            running = j.optBoolean("running"), periodOver = j.optBoolean("periodOver"), finished = j.optBoolean("finished"),
            winner = if (j.isNull("winner")) null else j.optInt("winner"),
            past = j.optJSONArray("past")?.let { a -> (0 until a.length()).map { a.getJSONArray(it).ints() } } ?: emptyList(),
        )
    }
}

// One timed game on this watch. The clock runs on the watch from the server's last answer, so it
// needs no requests to tick; the watch asks every 20 seconds (30 while stopped) to stay sure it
// has the latest. Points still count while the clock is stopped.
class TimedSession(
    private val api: Api,
    private val haptics: Haptics,
    first: TimedGame,
    private val onUnlinked: () -> Unit,
    private val onGone: () -> Unit,
) {
    var g by mutableStateOf(first)
        private set
    var card by mutableStateOf<Card?>(null)
        internal set
    var busy by mutableStateOf(false)
        private set
    var now by mutableLongStateOf(Session.clock())
        private set
    private var lastOk = Session.clock()
    private var nextCheck = 0L
    private var checking = false
    private var buzzed = false
    private var job: Job? = null

    private val waitMs get() = if (g.running) 20_000L else 30_000L
    val live get() = lastOk > 0 && api.connected() && Session.clock() - lastOk < waitMs + 6_000

    // The time left in the period, run on from the last answer while the clock runs.
    val leftMs get() = if (g.running) (g.leftMs - (now - lastOk)).coerceAtLeast(0) else g.leftMs
    val periodOver get() = g.periodOver || (g.running && leftMs == 0L)

    fun start(scope: CoroutineScope) {
        job?.cancel()
        job = scope.launch {
            while (true) {
                now = Session.clock()
                if (g.running && leftMs == 0L && !buzzed) {
                    buzzed = true
                    haptics.game()
                    nextCheck = 0 // ask now: the server's answer confirms the period's end
                }
                if (now >= nextCheck) check()
                delay(1_000)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    private suspend fun check() {
        if (checking || busy) return
        nextCheck = Session.clock() + waitMs
        if (!api.connected()) return
        checking = true
        val a = api.get("/match", mapOf("club" to g.club, "match" to g.match))
        checking = false
        when {
            a.ok -> take(TimedGame.from(a.json!!))
            a.code == 401 -> onUnlinked()
            a.code == 404 -> onGone()
        }
    }

    private fun take(d: TimedGame) {
        if (d.version >= g.version) {
            g = d
            if (!d.periodOver) buzzed = false
        }
        lastOk = Session.clock()
        now = lastOk
    }

    // 'start', 'pause', 'point0', 'point1' (with n points), 'undo' or 'next'.
    fun press(action: String, scope: CoroutineScope, n: Int = 0) {
        when {
            !api.connected() -> return refuse("No connection: phone or Wi-Fi?")
            busy -> return refuse("Still sending your last press")
        }
        busy = true
        scope.launch {
            val body = JSONObject().put("club", g.club).put("match", g.match).put("basedOn", g.version).put("action", action).put("n", n)
            val a = api.post("/press", body)
            busy = false
            when {
                a.ok -> {
                    val j = a.json!!
                    take(TimedGame.from(j))
                    if (j.optBoolean("counted")) {
                        card = null
                        if (g.finished) haptics.done() else haptics.point()
                    } else {
                        refuse(timedReason(j.optString("reason")))
                    }
                }
                a.code == 401 -> onUnlinked()
                else -> {
                    lastOk = 0
                    refuse(problem(a.code))
                }
            }
        }
    }

    // The clock on or off; when the time is up the next period.
    fun clockPress(scope: CoroutineScope) = when {
        periodOver -> press("next", scope)
        else -> press(if (g.running) "pause" else "start", scope)
    }

    private fun refuse(text: String) {
        card = Card("NOT COUNTED", text, Card.Kind.REFUSED, Session.clock() + 2_600)
        haptics.refused()
        now = Session.clock()
    }
}

fun timedReason(why: String) = when (why) {
    "stale" -> "The score had just changed"
    "nothing" -> "Nothing to undo"
    "periodover" -> "Time is up: start the next"
    "notstarted" -> "Start the clock first"
    "running" -> "Stop the clock first"
    "over" -> "The game is over"
    else -> "Not now"
}

// "07:42" (rounded up, so 00:00 shows only when the time is up).
fun clockText(ms: Long): String {
    val s = (ms + 999) / 1000
    return "%02d:%02d".format(s / 60, s % 60)
}

// The timed game: LIVE or PAUSED and the period at the top, the clock in the middle (tap it to
// stop or start), HOME and AWAY with their score under it (tap one for a point). When the
// period's time is up: a screen of its own; after the last, who won. A long press: the menu.
@Composable
fun TimedScreen(session: TimedSession, onPoint: (Int) -> Unit, onMenu: () -> Unit, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    val g = session.g
    Box(Modifier.fillMaxSize().background(Look.black).pointerInput(Unit) { detectTapGestures(onLongPress = { onMenu() }) }) {
        when {
            g.finished -> Finished(g, onDone, onUndo = { session.press("undo", scope) })
            session.periodOver -> PeriodOver(g, onNext = { session.press("next", scope) }, onUndo = { session.press("undo", scope) })
            else -> Clock(session, onClock = { session.clockPress(scope) }, onPoint = onPoint)
        }
        val card = session.card
        if (card != null && session.now < card.until) StatusCard(card.title, card.line, Look.orange)
        else if (!session.live) StatusCard("SCORING PAUSED", "No connection: checking…", Look.card)
    }
}

@Composable
private fun Clock(session: TimedSession, onClock: () -> Unit, onPoint: (Int) -> Unit) {
    val g = session.g
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val scoreH = maxHeight * 0.2f
        val nameW = maxWidth * 0.36f
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            val color = when { !session.live -> Look.orange; g.running -> Look.green; else -> Look.muted }
            val state = when { !session.live -> "OFFLINE"; g.running -> "● LIVE"; else -> "❚❚ PAUSED" }
            Text("$state · ${g.periodName()}", color = color, fontSize = 11.sp, letterSpacing = 1.sp, fontWeight = FontWeight.Bold)
            Box(Modifier.pointerInput(Unit) { detectTapGestures(onTap = { onClock() }) }.padding(horizontal = 16.dp, vertical = 2.dp)) {
                DisplayText(clockText(session.leftMs), 46.sp, if (g.running) Look.white else Look.muted)
            }
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf(0, 1).forEach { t ->
                    Column(
                        Modifier.pointerInput(t) { detectTapGestures(onTap = { onPoint(t) }) },
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        DisplayText(firstNames(g.name(t)).uppercase(), 13.sp, modifier = Modifier.width(nameW))
                        Box(Modifier.padding(top = 3.dp).height(scoreH).background(Look.card, RoundedCornerShape(10.dp)).padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                            DisplayText("${g.score[t]}", (scoreH.value * 0.8f).sp)
                        }
                    }
                    if (t == 0) DisplayText("–", 20.sp, Look.faint, Modifier.padding(top = 28.dp))
                }
            }
        }
    }
}

// The total, then each period played.
@Composable
private fun Scores(g: TimedGame) {
    DisplayText("${g.score[0]} – ${g.score[1]}", 34.sp)
    g.byPeriod().takeLast(4).forEachIndexed { i, p ->
        val n = g.byPeriod().size - g.byPeriod().takeLast(4).size + i + 1
        Row(Modifier.fillMaxWidth(0.62f), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(g.periodName(n), color = Look.muted, fontSize = 11.sp)
            Text("${p[0]} – ${p[1]}", color = Look.white, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun PeriodOver(g: TimedGame, onNext: () -> Unit, onUndo: () -> Unit) {
    val last = g.period >= g.periods
    val title = when { last -> "FULL TIME"; g.period * 2 == g.periods -> "HALF-TIME"; else -> "END OF ${g.periodName()}" }
    val next = if (last) "Finish" else "Start " + if (g.periods == 4) "Q${g.period + 1}" else "2nd half"
    Column(Modifier.fillMaxSize().padding(horizontal = 18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(title, color = Look.muted, fontSize = 12.sp, letterSpacing = 2.sp, fontWeight = FontWeight.Bold)
        Scores(g)
        Spacer(Modifier.height(4.dp))
        Button(onClick = onNext, colors = ButtonDefaults.buttonColors(backgroundColor = Look.green), modifier = Modifier.fillMaxWidth(0.72f).height(36.dp), shape = RoundedCornerShape(18.dp)) {
            Text(next, color = Look.black, fontWeight = FontWeight.Bold)
        }
        UndoText(onUndo)
    }
}

@Composable
private fun Finished(g: TimedGame, onDone: () -> Unit, onUndo: () -> Unit) {
    val title = g.winner?.let { "${firstNames(g.name(it)).uppercase()} WIN" } ?: "DRAW"
    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        DisplayText(title, 18.sp)
        Scores(g)
        Text("Saved to your games", color = Look.muted, fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
        Button(onClick = onDone, colors = ButtonDefaults.outlinedButtonColors(), border = ButtonDefaults.outlinedButtonBorder(borderColor = Look.white), modifier = Modifier.fillMaxWidth(0.55f).height(32.dp), shape = RoundedCornerShape(16.dp)) {
            Text("Done", color = Look.white, fontWeight = FontWeight.Bold)
        }
        UndoText(onUndo)
    }
}

@Composable
private fun UndoText(onUndo: () -> Unit) {
    Box(Modifier.padding(top = 2.dp).pointerInput(Unit) { detectTapGestures(onTap = { onUndo() }) }.padding(6.dp)) {
        Text("Undo last point", color = Look.muted, fontSize = 11.sp)
    }
}

// ---------- basketball: +1, +2 or +3 ----------

// HOME SCORES: +1, +2 or +3; the usual (+2) is chosen and counts by itself after 2 seconds. Tap
// one to count it now; turning the crown or bezel chooses another (and waits again).
@Composable
fun PointsScreen(g: TimedGame, team: Int, picked: Int, onPick: (Int) -> Unit, onCount: (Int) -> Unit) {
    LaunchedEffect(picked) {
        delay(2_000)
        onCount(g.values[picked])
    }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    val n = g.values.size
    Column(Modifier.fillMaxSize().background(Look.black)
        .onRotaryScrollEvent { e -> onPick(((picked + if (e.verticalScrollPixels > 0) 1 else -1) % n + n) % n); true }
        .focusRequester(focus).focusable().padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        DisplayText("${firstNames(g.name(team)).uppercase()} SCORES", 15.sp)
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            g.values.forEachIndexed { i, v ->
                val on = i == picked
                Box(
                    Modifier.weight(1f).height(58.dp).background(if (on) Look.green else Look.card, RoundedCornerShape(12.dp))
                        .pointerInput(i) { detectTapGestures(onTap = { onCount(v) }) },
                    contentAlignment = Alignment.Center,
                ) { DisplayText("+$v", 26.sp, if (on) Look.black else Look.white) }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text("+${g.values[picked]} counts by itself in 2 s", color = Look.muted, fontSize = 10.sp)
    }
}

// Which of the values is chosen first: the usual.
fun usualIndex(g: TimedGame) = g.values.indexOf(g.usual).coerceAtLeast(0)
