package it.skoor.wear

import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay
import org.json.JSONObject

// Linking, once: the watch shows a QR code and a key (K7M 2QX). Scanned with a phone, or typed in
// the app under You → Watches, someone signed in confirms it, and the watch gets its own key for
// that account. No phone app needed: the watch talks to Skoor itself afterwards.
@Composable
fun LinkScreen(api: Api, store: Store, haptics: Haptics, onLinked: () -> Unit) {
    var key by remember { mutableStateOf<String?>(null) }
    var qr by remember { mutableStateOf<List<String>>(emptyList()) }
    var message by remember { mutableStateOf("Getting a key…") }

    LaunchedEffect(Unit) {
        while (true) {
            val start = api.post("/link/start", JSONObject().put("model", "${Build.MANUFACTURER} ${Build.MODEL}".trim()))
            if (!start.ok) {
                message = problem(start.code)
                delay(5_000)
                continue
            }
            val j = start.json!!
            key = j.getString("key")
            qr = j.getJSONArray("qr").let { a -> (0 until a.length()).map { a.getString(it) } }
            val secret = j.getString("secret")
            // Ask every 3 seconds whether it was confirmed, until the key expires (then a new one).
            while (true) {
                delay(3_000)
                val p = api.post("/link/poll", JSONObject().put("key", key).put("secret", secret))
                if (p.ok && p.json!!.optString("status") == "linked") {
                    store.token = p.json.getString("token")
                    haptics.done()
                    onLinked()
                    return@LaunchedEffect
                }
                if (p.code == 410 || p.code == 403) break
            }
        }
    }

    LinkContent(key, qr, message)
}

// What the linking screen shows: the QR code and the key, or a message until there is one.
@Composable
fun LinkContent(key: String?, qr: List<String>, message: String) {
    Column(Modifier.fillMaxSize().background(Look.black).padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        val k = key
        if (k == null) {
            Text(message, color = Look.white, fontSize = 13.sp, textAlign = TextAlign.Center)
            return@Column
        }
        Text("LINK THIS WATCH", color = Look.muted, fontSize = 10.sp, letterSpacing = 1.5.sp)
        Box(Modifier.padding(vertical = 4.dp).background(Color.White, RoundedCornerShape(6.dp)).padding(5.dp)) { Qr(qr) }
        DisplayText("${k.take(3)} ${k.drop(3)}", 24.sp)
        Text("Scan, or in the app: You → Watches", color = Look.muted, fontSize = 10.sp, textAlign = TextAlign.Center)
    }
}

// The QR code from the server's rows of 0 and 1, as black squares on white.
@Composable
private fun Qr(rows: List<String>) {
    Canvas(Modifier.size(84.dp)) {
        val n = rows.size
        if (n == 0) return@Canvas
        val cell = size.width / n
        rows.forEachIndexed { r, row ->
            row.forEachIndexed { c, ch ->
                if (ch == '1') drawRect(Color.Black, Offset(c * cell, r * cell), Size(cell + 0.5f, cell + 0.5f))
            }
        }
    }
}
