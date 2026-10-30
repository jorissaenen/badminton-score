package it.skoor.wear

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.URLEncoder

// Talks to Skoor's server for watches (functions/watch.js), as the Garmin app does. A Wear OS
// watch reaches the internet through its phone (Bluetooth), Wi-Fi or LTE; the server knows the
// watch by its own key, given once when it was linked to an account.
open class Api(context: Context, private val store: Store) {
    class Answer(val code: Int, val json: JSONObject?) {
        val ok get() = code == 200 && json != null
    }

    private val connectivity = context.getSystemService(ConnectivityManager::class.java)

    // Whether the watch can reach the internet now (through the phone, Wi-Fi or LTE).
    open fun connected(): Boolean {
        val caps = connectivity.getNetworkCapabilities(connectivity.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    suspend fun get(path: String, params: Map<String, String> = emptyMap()): Answer {
        val query = params.entries.joinToString("&") { "${it.key}=${URLEncoder.encode(it.value, "UTF-8")}" }
        return request("GET", path + if (query.isEmpty()) "" else "?$query", null)
    }

    suspend fun post(path: String, body: JSONObject): Answer = request("POST", path, body)

    private suspend fun request(method: String, path: String, body: JSONObject?): Answer = withContext(Dispatchers.IO) {
        if (!connected()) return@withContext Answer(NO_CONNECTION, null)
        try {
            val c = URL(BASE + path).openConnection() as HttpURLConnection
            c.requestMethod = method
            // Short time-outs: a press that can't get through is said at once, not after half a minute.
            c.connectTimeout = 8_000
            c.readTimeout = 10_000
            store.token?.let { c.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val code = c.responseCode
            val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }
            c.disconnect()
            Answer(code, text?.let { runCatching { JSONObject(it) }.getOrNull() })
        } catch (e: SocketTimeoutException) {
            Answer(TIMED_OUT, null)
        } catch (e: Exception) {
            Answer(NO_CONNECTION, null)
        }
    }

    companion object {
        const val BASE = "https://europe-west1-badminton-dev-bc258.cloudfunctions.net/watch"
        const val NO_CONNECTION = -1
        const val TIMED_OUT = -2
    }
}

// What the watch keeps: its key for the account, and its settings.
class Store(context: Context) {
    private val prefs = context.getSharedPreferences("skoor", Context.MODE_PRIVATE)

    var token: String?
        get() = prefs.getString("token", null)
        set(v) = prefs.edit().apply { if (v == null) remove("token") else putString("token", v) }.apply()

    // Touch scoring: tap the top or bottom half (on by default: most Wear OS watches are touch first).
    var touch by flag("touch", true)
    // Your own team on top (and on the top button) when you play in the match.
    var myUp by flag("myUp", true)
    // A card and a buzz at the interval and when the teams change ends.
    var alerts by flag("alerts", true)
    // The screen stays on while scoring.
    var keepOn by flag("keepOn", true)

    private fun flag(key: String, default: Boolean) = object : kotlin.properties.ReadWriteProperty<Any?, Boolean> {
        override fun getValue(thisRef: Any?, property: kotlin.reflect.KProperty<*>) = prefs.getBoolean(key, default)
        override fun setValue(thisRef: Any?, property: kotlin.reflect.KProperty<*>, value: Boolean) = prefs.edit().putBoolean(key, value).apply()
    }
}
