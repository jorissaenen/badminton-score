package it.skoor.wear

import org.json.JSONArray
import org.json.JSONObject

// A match as the server describes it to watches (functions/watch.js, summary()): the score as on
// the flip tiles, who serves, the earlier games, how long the score is still frozen, the side the
// watch's owner plays on, the ends and the interval.
data class Summary(
    val club: String,
    val match: String,
    val version: Int,
    val court: Int?,
    val bestOf: Int,
    val home: String,
    val away: String,
    val tiles: List<String>,
    val server: Int,
    val won: List<Int>,
    val past: List<List<Int>>,
    val gameNo: Int,
    val gameOver: Boolean,
    val gameWinner: Int?,
    val matchWinner: Int?,
    val frozenMs: Long,
    val lastAction: String,
    val mine: Int?,
    val ends: Boolean,
    val interval: Boolean,
    val pointMs: Long?,
) {
    fun name(team: Int) = if (team == 0) home else away

    // Every game so far as [team 1, team 2], the current one last.
    fun allGames(): List<List<Int>> = past + listOf(tiles.map { plain(it).toIntOrNull() ?: 0 })

    companion object {
        private fun JSONObject.intOrNull(key: String): Int? = if (isNull(key) || !has(key)) null else getInt(key)
        private fun JSONArray.strings() = (0 until length()).map { getString(it) }
        private fun JSONArray.ints() = (0 until length()).map { getInt(it) }

        fun from(j: JSONObject) = Summary(
            club = j.getString("club"),
            match = j.getString("match"),
            version = j.optInt("version"),
            court = j.intOrNull("court"),
            bestOf = j.optInt("bestOf", 1),
            home = j.optString("home"),
            away = j.optString("away"),
            tiles = j.getJSONArray("tiles").strings(),
            server = j.optInt("server", -1),
            won = j.optJSONArray("won")?.ints() ?: listOf(0, 0),
            past = j.optJSONArray("past")?.let { a -> (0 until a.length()).map { a.getJSONArray(it).ints() } } ?: emptyList(),
            gameNo = j.optInt("gameNo", 1),
            gameOver = j.optBoolean("gameOver"),
            gameWinner = j.intOrNull("gameWinner"),
            matchWinner = j.intOrNull("matchWinner"),
            frozenMs = j.optLong("frozenMs"),
            lastAction = j.optString("lastAction"),
            mine = j.intOrNull("mine"),
            ends = j.optBoolean("ends"),
            interval = j.optBoolean("interval"),
            pointMs = if (j.has("pointMs") && !j.isNull("pointMs")) j.getLong("pointMs") else null,
        )
    }
}

// "07" on the tiles is 7 in a text; "AD" stays.
fun plain(tile: String): String = if (tile.length == 2 && tile[0] == '0') tile.substring(1) else tile

// "Joris Saenen & Maarten Loyens" → "Joris & Maarten".
fun firstNames(side: String): String = side.split(" & ").joinToString(" & ") { it.trim().substringBefore(' ') }
