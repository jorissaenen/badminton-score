import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

module Score {
    //! "14" stays "14", "07" becomes "7" (the flip tiles show 07; a text shows 7). "AD" stays.
    function plain(tile as String) as String {
        if (tile.length() == 2 && "0".equals(tile.substring(0, 1))) {
            return tile.substring(1, 2) as String;
        }
        return tile;
    }
}

//! One match, being scored: team 1 on top, team 2 below, as flip tiles; the side that serves in
//! green. UP gives team 1 a point, DOWN team 2, BACK undoes, START opens the menu (or the next game).
//!
//! The watch only scores while it's sure it has the latest score: it asks every 2.5 seconds, and
//! shows LIVE (green) while the last answer is less than 8 seconds old, OFFLINE (orange) otherwise,
//! with scoring paused. Every press says which version of the score it was made on; the server
//! counts the first press only, and freezes the score for 5 seconds after a point (undo still
//! works). A press that doesn't count gets an orange NOT COUNTED card and a different buzz.
class ScoreView extends WatchUi.View {
    const POLL_TICKS = 5; // ticks of 500 ms between two checks
    const LIVE_MS = 8000;

    var club as String;
    var match as String;
    var s as Dictionary; // the score, as the server describes it (functions/watch.js summary)
    var lastOk as Number = 0; // when the server last answered (System.getTimer)
    var frozenUntil as Number = 0;
    var refusedText as String? = null;
    var refusedUntil as Number = 0;
    var pressBusy as Boolean = false;
    private var _pollBusy as Boolean = false;
    private var _ticks as Number = 0;
    private var _timer as Timer.Timer?;

    function initialize(clubId as String, matchId as String, first as Dictionary) {
        View.initialize();
        club = clubId;
        match = matchId;
        s = first;
        lastOk = System.getTimer();
        frozenUntil = lastOk + (first["frozenMs"] as Number);
    }

    function onShow() as Void {
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 500, true);
        poll();
    }

    function onHide() as Void {
        if (_timer != null) {
            _timer.stop();
        }
    }

    function live() as Boolean {
        return lastOk != 0 && System.getTimer() - lastOk < LIVE_MS;
    }

    function onTick() as Void {
        _ticks += 1;
        if (_ticks % POLL_TICKS == 0) {
            poll();
        }
        WatchUi.requestUpdate();
    }

    function poll() as Void {
        if (_pollBusy || pressBusy) {
            return;
        }
        _pollBusy = true;
        Api.get("/match", { "club" => club, "match" => match }, method(:onMatch));
    }

    function onMatch(code as Number, data as Dictionary or String or Null) as Void {
        _pollBusy = false;
        if (code == 200 && data instanceof Dictionary) {
            take(data);
        } else if (code == 401) {
            unlinked();
        } else if (code == 404) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT); // removed from the event
        }
        WatchUi.requestUpdate();
    }

    //! A newer (or the same) score from the server.
    function take(d as Dictionary) as Void {
        if ((d["version"] as Number) >= (s["version"] as Number)) {
            s = d;
        }
        var now = System.getTimer();
        lastOk = now;
        frozenUntil = now + (d["frozenMs"] as Number);
    }

    //! 'point0', 'point1', 'undo' or 'next'.
    function press(action as String) as Void {
        if (pressBusy) {
            return;
        }
        if (!live()) {
            refuse("Scoring paused: no connection");
            return;
        }
        pressBusy = true;
        Api.post("/press", { "club" => club, "match" => match, "basedOn" => s["version"], "action" => action }, method(:onPress));
    }

    function onPress(code as Number, data as Dictionary or String or Null) as Void {
        pressBusy = false;
        if (code == 200 && data instanceof Dictionary) {
            take(data);
            if (data["counted"] == true) {
                refusedUntil = 0;
                if (s["matchWinner"] != null) {
                    Look.buzzDone();
                } else if (s["gameOver"] == true) {
                    Look.buzzGame();
                } else {
                    Look.buzzPoint();
                }
            } else {
                refuse(reason(data));
            }
        } else if (code == 401) {
            unlinked();
            return;
        } else {
            lastOk = 0; // no answer: not live until the next one
            refuse(Api.problem(code));
        }
        WatchUi.requestUpdate();
    }

    function reason(d as Dictionary) as String {
        var why = d["reason"] as String;
        var by = d["by"] as String?;
        var known = by != null && !by.equals("");
        var score = Score.plain((s["tiles"] as Array)[0] as String) + "–" + Score.plain((s["tiles"] as Array)[1] as String);
        if (why.equals("stale")) {
            return known ? by + " was first · " + score : "Score had just changed · " + score;
        }
        if (why.equals("frozen")) {
            return known ? by + " just scored · " + score : "Frozen 5 s after a point";
        }
        if (why.equals("over")) {
            return "The match is over";
        }
        if (why.equals("gameover")) {
            return "Game over: START for the next";
        }
        if (why.equals("nothing")) {
            return "Nothing to undo";
        }
        return "Not now";
    }

    function refuse(text as String) as Void {
        refusedText = text;
        refusedUntil = System.getTimer() + 2600;
        Look.buzzRefused();
        WatchUi.requestUpdate();
    }

    // ---------- drawing ----------

    //! The largest number font whose digits fit in a tile of height th.
    function tileFont(dc as Graphics.Dc, th as Number) as Graphics.FontType {
        var fonts = [Graphics.FONT_NUMBER_THAI_HOT, Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_MEDIUM];
        for (var i = 0; i < fonts.size(); i++) {
            if (Graphics.getFontAscent(fonts[i]) <= th * 0.86) {
                return fonts[i];
            }
        }
        return Graphics.FONT_SMALL;
    }

    //! Two flip tiles with the characters of `text`, centred on (cx, cy); green when serving.
    function tiles(dc as Graphics.Dc, cx as Number, cy as Number, th as Number, text as String, serving as Boolean, font as Graphics.FontType) as Void {
        var tw = (th * 0.72).toNumber();
        var gap = (th * 0.08).toNumber() + 2;
        var x = cx - tw - gap / 2;
        var chars = text.toCharArray();
        for (var i = 0; i < 2; i++) {
            var tx = x + i * (tw + gap);
            dc.setColor(serving ? Look.GREEN : Look.CARD, serving ? Look.GREEN : Look.CARD);
            dc.fillRoundedRectangle(tx, cy - th / 2, tw, th, (th * 0.14).toNumber());
            var c = i < chars.size() ? chars[i].toString() : "";
            Look.text(dc, tx + tw / 2, cy, font, c, serving ? Look.BLACK : Look.WHITE);
            dc.setColor(serving ? Look.BLACK : Look.BLACK, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(tx, cy - 1, tw, 2);
        }
    }

    //! One side: its name (green when serving) and, in a match of more games, the earlier games'
    //! scores before the tiles.
    function side(dc as Graphics.Dc, team as Number, nameY as Number, tileY as Number, th as Number, font as Graphics.FontType) as Void {
        var w = dc.getWidth();
        var serving = (s["server"] as Number) == team;
        var name = team == 0 ? s["home"] as String : s["away"] as String;
        Look.text(dc, w / 2, nameY, Graphics.FONT_XTINY, name.toUpper(), serving ? Look.GREEN : Look.WHITE);
        var past = s["past"] as Array;
        var tilesText = (s["tiles"] as Array)[team] as String;
        var pastW = past.size() * (th * 0.42).toNumber();
        var cx = w / 2 + pastW / 2;
        tiles(dc, cx, tileY, th, tilesText, serving, font);
        // Earlier games: the winner of each in white, the loser grey.
        var tw = (th * 0.72).toNumber();
        var px = cx - tw - (th * 0.08).toNumber() - 2 - pastW;
        for (var i = 0; i < past.size(); i++) {
            var g = past[i] as Array;
            var mine = g[team] as Number;
            var theirs = g[1 - team] as Number;
            Look.text(dc, px + (th * 0.21).toNumber() + i * (th * 0.42).toNumber(), tileY, Graphics.FONT_XTINY, mine.toString(), mine > theirs ? Look.WHITE : Look.FAINT);
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var now = System.getTimer();
        dc.setColor(Look.BLACK, Look.BLACK);
        dc.clear();

        // Top: LIVE or OFFLINE, and which game.
        var isLive = live();
        var status = isLive ? "LIVE" : "OFFLINE";
        var game = (s["bestOf"] as Number) > 1 ? " · GAME " + (s["gameNo"] as Number).toString() : "";
        var top = (h * 0.11).toNumber();
        var label = status + game;
        var lw = dc.getTextWidthInPixels(label, Graphics.FONT_XTINY);
        dc.setColor(isLive ? Look.GREEN : Look.ORANGE, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(w / 2 - lw / 2 - 8, top, 4);
        Look.text(dc, w / 2 + 4, top, Graphics.FONT_XTINY, label, isLive ? Look.GREEN : Look.ORANGE);

        // Frozen after a point: a bar that runs down.
        var left = frozenUntil - now;
        if (left > 0 && isLive) {
            var bw = ((w * 0.5) * left / 5000).toNumber();
            dc.setColor(Look.MUTED, Look.MUTED);
            dc.fillRectangle(w / 2 - bw / 2, top + 12, bw, 3);
        }

        var th = (h * 0.21).toNumber();
        var font = tileFont(dc, th);
        side(dc, 0, (h * 0.24).toNumber(), (h * 0.38).toNumber(), th, font);
        dc.setColor(Look.LINE, Look.LINE);
        dc.fillRectangle((w * 0.25).toNumber(), (h * 0.52).toNumber(), (w * 0.5).toNumber(), 1);
        side(dc, 1, (h * 0.80).toNumber(), (h * 0.66).toNumber(), th, font);
        if (s["court"] != null) {
            Look.text(dc, w / 2, (h * 0.90).toNumber(), Graphics.FONT_XTINY, "COURT " + (s["court"] as Number).toString(), Look.FAINT);
        }

        // A game or the match won.
        if (s["gameOver"] == true) {
            drawOver(dc);
        }
        // Not counted (orange), or scoring paused (grey).
        if (refusedText != null && now < refusedUntil) {
            Look.card(dc, "NOT COUNTED", refusedText as String, true);
        } else if (!isLive) {
            Look.card(dc, "SCORING PAUSED", "No connection: checking…", false);
        }
    }

    function drawOver(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cw = (w * 0.84).toNumber();
        var ch = (h * 0.46).toNumber();
        var x = (w - cw) / 2;
        var y = (h - ch) / 2;
        dc.setColor(Look.BLACK, Look.BLACK);
        dc.fillRoundedRectangle(x - 4, y - 4, cw + 8, ch + 8, 20);
        dc.setColor(Look.CARD, Look.CARD);
        dc.fillRoundedRectangle(x, y, cw, ch, 16);
        var matchWinner = s["matchWinner"];
        var winner = matchWinner != null ? matchWinner as Number : s["gameWinner"] as Number;
        var name = (winner == 0 ? s["home"] : s["away"]) as String;
        var scores = (s["past"] as Array).slice(0, null);
        var tiles = s["tiles"] as Array;
        if (matchWinner != null) {
            Look.text(dc, w / 2, y + ch * 0.17, Graphics.FONT_XTINY, name.toUpper() + " WIN", Look.WHITE);
        } else {
            Look.text(dc, w / 2, y + ch * 0.17, Graphics.FONT_XTINY, "GAME " + (s["gameNo"] as Number).toString() + " · " + name.toUpper(), Look.WHITE);
        }
        // The games as columns: a row per side, each game's winner white.
        scores.add([Score.plain(tiles[0] as String).toNumber(), Score.plain(tiles[1] as String).toNumber()]);
        var col = (cw * 0.16).toNumber();
        var x0 = w / 2 - (scores.size() * col) / 2 + col / 2;
        for (var team = 0; team < 2; team++) {
            var ry = y + ch * (team == 0 ? 0.40 : 0.60);
            for (var i = 0; i < scores.size(); i++) {
                var g = scores[i] as Array;
                var mine = g[team];
                var theirs = g[1 - team];
                var won = mine != null && theirs != null && (mine as Number) > (theirs as Number);
                Look.text(dc, x0 + i * col, ry, Graphics.FONT_TINY, mine == null ? "–" : (mine as Number).toString(), won ? Look.WHITE : Look.FAINT);
            }
        }
        Look.text(dc, w / 2, y + ch * 0.84, Graphics.FONT_XTINY, matchWinner != null ? "START: done · BACK: undo" : "START: next game", Look.GREEN);
    }
}

//! UP: point team 1 · DOWN: point team 2 · BACK: undo · START: menu, or the next game when a game
//! is over · a tap on the top or bottom half scores too, when touch scoring is on (menu).
class ScoreDelegate extends WatchUi.BehaviorDelegate {
    private var _view as ScoreView;

    function initialize(view as ScoreView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onKey(evt as WatchUi.KeyEvent) as Boolean {
        var key = evt.getKey();
        if (key == WatchUi.KEY_UP) {
            _view.press("point0");
            return true;
        }
        if (key == WatchUi.KEY_DOWN) {
            _view.press("point1");
            return true;
        }
        if (key == WatchUi.KEY_ESC) {
            _view.press("undo");
            return true;
        }
        if (key == WatchUi.KEY_ENTER) {
            start();
            return true;
        }
        return false;
    }

    //! START: the next game after a game; back to the matches after the match; the menu otherwise.
    function start() as Void {
        var s = _view.s;
        if (s["gameOver"] == true && s["matchWinner"] == null) {
            _view.press("next");
        } else if (s["matchWinner"] != null) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
        } else {
            Menus.showMatch(_view);
        }
    }

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        if (!Api.touchScoring()) {
            return true;
        }
        var y = evt.getCoordinates()[1];
        _view.press(y < System.getDeviceSettings().screenHeight / 2 ? "point0" : "point1");
        return true;
    }

    // Swipes and the back gesture don't leave or change anything while scoring.
    function onSwipe(evt as WatchUi.SwipeEvent) as Boolean {
        return true;
    }

    function onBack() as Boolean {
        return true;
    }

    function onMenu() as Boolean {
        Menus.showMatch(_view);
        return true;
    }
}
