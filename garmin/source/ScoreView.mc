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

//! One match, being scored: team 1 on top, team 2 below (or your own team on top), as flip tiles;
//! the side that serves in green. UP gives the team on top a point, DOWN the one below, BACK
//! undoes, START opens the menu (or the next game).
//!
//! The watch only scores while it's sure it has the latest score, and asks for it when a change is
//! likely: every request wakes the Bluetooth link, the largest part of the battery the app uses.
//! It knows how long a point takes in this match (the server's estimate from the match and the
//! players' earlier matches, then learnt from every point it sees), so after a point it waits, asks
//! often in the window where the next point is expected, and slows down when play stops; calm in
//! the interval, between games and after the match. It shows LIVE (green) while the last answer is
//! recent, OFFLINE (orange) otherwise, with scoring paused. The screen is only drawn again when
//! something on it changes.
//!
//! Every press says which version of the score it was made on; the server
//! counts the first press only, and freezes the score for 5 seconds after a point (undo still
//! works). A press that doesn't count gets an orange NOT COUNTED card and a different buzz.
class ScoreView extends WatchUi.View {

    var club as String;
    var match as String;
    var s as Dictionary; // the score, as the server describes it (functions/watch.js summary)
    var lastOk as Number = 0; // when the server last answered (System.getTimer)
    var frozenUntil as Number = 0;
    var refusedText as String? = null;
    var refusedUntil as Number = 0;
    var pressBusy as Boolean = false;
    var alertTitle as String? = null; // INTERVAL, CHANGE ENDS
    var alertLine as String = "";
    var alertUntil as Number = 0;
    private var _pollBusy as Boolean = false;
    private var _nextPoll as Number = 0;
    private var _lastPoint as Number = 0; // when the last point was seen (or scored here)
    private var _paceMs as Number = 18000; // expected time from one point to the next, learnt
    private var _paced as Boolean = false; // got the server's estimate (asked once, with pace=1)
    private var _wait as Number = 3000; // the wait chosen at the last check
    private var _drawnLive as Boolean = true;
    private var _timer as Timer.Timer?;

    function initialize(clubId as String, matchId as String, first as Dictionary) {
        View.initialize();
        club = clubId;
        match = matchId;
        s = first;
        lastOk = System.getTimer();
        _lastPoint = lastOk;
        frozenUntil = lastOk + (first["frozenMs"] as Number);
    }

    //! How long to wait before asking for the score again (see above).
    function pollMs() as Number {
        var since = System.getTimer() - _lastPoint;
        if (s["matchWinner"] != null) {
            return 20000; // only an undo can still come
        }
        if (s["gameOver"] == true) {
            return since < 90000 ? 15000 : 4000; // two minutes between games
        }
        if (s["interval"] == true) {
            return since < 45000 ? 10000 : 4000; // the 60-second interval
        }
        // The window of the next point: from 60% to 180% of the usual time, never in the 5-second
        // freeze after a point (nothing else can count then).
        var opens = _paceMs * 6 / 10 > 5000 ? _paceMs * 6 / 10 : 5000;
        var closes = _paceMs * 18 / 10;
        if (since < opens) {
            var left = opens - since;
            return left < 2500 ? 2500 : left > 10000 ? 10000 : left;
        }
        if (since < closes) {
            return 2500;
        }
        return since < 120000 ? 6000 : 12000; // play stopped: a break, a long rally, a discussion
    }

    //! A point seen: learn how long points take here (leaving out breaks and long pauses).
    function learn() as Void {
        var now = System.getTimer();
        var gap = now - _lastPoint;
        if (gap > 3000 && gap < 3 * _paceMs) {
            _paceMs = (_paceMs * 7 + gap * 3) / 10;
        }
        _lastPoint = now;
    }

    //! Whether the watch can reach Skoor now: through the phone (Bluetooth), or Wi-Fi/LTE.
    function connected() as Boolean {
        var settings = System.getDeviceSettings();
        if (settings has :connectionAvailable) {
            return settings.connectionAvailable;
        }
        return settings.phoneConnected;
    }

    function onShow() as Void {
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 1000, true);
        poll();
    }

    function onHide() as Void {
        if (_timer != null) {
            _timer.stop();
        }
    }

    //! Live: connected, and the last answer is no older than two waits (plus a margin).
    function live() as Boolean {
        return lastOk != 0 && connected() && System.getTimer() - lastOk < _wait + 6000;
    }

    //! Once a second: ask when it's time, and draw only what changed (the frozen bar running down,
    //! a card coming or going, LIVE turning OFFLINE).
    function onTick() as Void {
        var now = System.getTimer();
        if (now >= _nextPoll) {
            poll();
        }
        var isLive = live();
        var moving = (frozenUntil > now - 1000) || (refusedUntil > now - 1000) || (alertUntil > now - 1000);
        if (moving || isLive != _drawnLive) {
            WatchUi.requestUpdate();
        }
    }

    function poll() as Void {
        if (_pollBusy || pressBusy) {
            return;
        }
        _wait = pollMs();
        _nextPoll = System.getTimer() + _wait;
        if (!connected()) {
            return; // nothing to ask through; checked again at the next tick
        }
        _pollBusy = true;
        var params = { "club" => club, "match" => match };
        if (!_paced) {
            params["pace"] = "1";
        }
        Api.get("/match", params, method(:onMatch));
    }

    function onMatch(code as Number, data as Dictionary or String or Null) as Void {
        _pollBusy = false;
        if (code == 200 && data instanceof Dictionary) {
            if (!_paced && data["pointMs"] != null) {
                _paceMs = data["pointMs"] as Number;
                _paced = true;
            }
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
        if ((d["version"] as Number) > (s["version"] as Number)) {
            alertFor(s, d);
            var action = d["lastAction"] as String?;
            if (action != null && action.find("point") == 0) {
                learn();
            } else {
                _lastPoint = System.getTimer(); // an undo or the next game: count from now
            }
        }
        if ((d["version"] as Number) >= (s["version"] as Number)) {
            s = d;
        }
        var now = System.getTimer();
        lastOk = now;
        frozenUntil = now + (d["frozenMs"] as Number);
    }

    //! The interval (at 11) or a change of ends, between two scores: a green card and a buzz, unless
    //! switched off in the menu. A change of ends with the next game shows too.
    function alertFor(was as Dictionary, now as Dictionary) as Void {
        if (!Api.isOn("alerts") || now["gameOver"] == true) {
            return;
        }
        var ends = now["ends"] != was["ends"];
        if (now["interval"] == true) {
            alertTitle = "INTERVAL";
            alertLine = ends ? "Change ends" : "60 seconds";
        } else if (ends) {
            alertTitle = "CHANGE ENDS";
            alertLine = "Teams switch sides";
        } else {
            return;
        }
        alertUntil = System.getTimer() + 5000;
        Look.buzzGame();
    }

    //! The team on top (and on UP): your own team when you play in the match and "My team on UP"
    //! is on (menu), else team 1.
    function top() as Number {
        return Api.isOn("myUp") && s["mine"] == 1 ? 1 : 0;
    }

    //! A point for the team on top (UP) or at the bottom (DOWN).
    function pointFor(onTop as Boolean) as Void {
        press("point" + (onTop ? top() : 1 - top()).toString());
    }

    //! 'point0', 'point1', 'undo' or 'next'.
    //! Every press gets an answer at once when it can't be sent: no connection (it would only time
    //! out after half a minute), or the last press still on its way.
    function press(action as String) as Void {
        if (!connected()) {
            refuse("No connection to your phone");
            return;
        }
        if (pressBusy) {
            refuse("Still sending your last press");
            return;
        }
        if (!live()) {
            refuse("Scoring paused: checking the score");
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
        var shown = Look.name(dc, name, Graphics.FONT_XTINY, Look.widthAt(dc, nameY, 14), true);
        Look.text(dc, w / 2, nameY, Graphics.FONT_XTINY, shown, serving ? Look.GREEN : Look.WHITE);
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
        _drawnLive = live();

        // A game or the match won: a screen of its own (no card over the score).
        if (s["gameOver"] == true) {
            if (s["matchWinner"] != null) {
                drawMatchWon(dc);
            } else {
                drawGameWon(dc);
            }
            cards(dc, now);
            return;
        }

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
        side(dc, top(), (h * 0.24).toNumber(), (h * 0.38).toNumber(), th, font);
        dc.setColor(Look.LINE, Look.LINE);
        dc.fillRectangle((w * 0.25).toNumber(), (h * 0.52).toNumber(), (w * 0.5).toNumber(), 1);
        side(dc, 1 - top(), (h * 0.80).toNumber(), (h * 0.66).toNumber(), th, font);
        if (s["court"] != null) {
            Look.text(dc, w / 2, (h * 0.90).toNumber(), Graphics.FONT_XTINY, "COURT " + (s["court"] as Number).toString(), Look.FAINT);
        }

        cards(dc, now);
    }

    //! Not counted (orange), or scoring paused (grey), over whatever is on screen.
    function cards(dc as Graphics.Dc, now as Number) as Void {
        if (refusedText != null && now < refusedUntil) {
            Look.card(dc, "NOT COUNTED", refusedText as String, Look.ORANGE);
        } else if (alertTitle != null && now < alertUntil) {
            Look.card(dc, alertTitle as String, alertLine, Look.GREEN);
        } else if (!live()) {
            Look.card(dc, "SCORING PAUSED", "No connection: checking…", Look.CARD);
        }
    }

    //! The scores of all games, the one just finished last, as [team 1, team 2] numbers.
    function allGames() as Array {
        var games = (s["past"] as Array).slice(0, null) as Array;
        var tiles = s["tiles"] as Array;
        games.add([Score.plain(tiles[0] as String).toNumber(), Score.plain(tiles[1] as String).toNumber()]);
        return games;
    }

    //! Game won (more games to play): who won it, the score, and START for the next game.
    function drawGameWon(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var winner = s["gameWinner"] as Number;
        var game = (allGames()[(s["gameNo"] as Number) - 1]) as Array;
        Look.text(dc, w / 2, h * 0.20, Graphics.FONT_XTINY, "GAME " + (s["gameNo"] as Number).toString(), Look.MUTED);
        var who = (winner == 0 ? s["home"] : s["away"]) as String;
        Look.text(dc, w / 2, h * 0.32, Graphics.FONT_SMALL, Look.name(dc, who, Graphics.FONT_SMALL, Look.widthAt(dc, h * 0.32, 14), true), Look.WHITE);
        // The score, the winner's first: two numbers and a dash between (number fonts have digits only).
        var font = Graphics.FONT_NUMBER_MEDIUM;
        var a = (game[winner] as Number).toString();
        var b = (game[1 - winner] as Number).toString();
        var gap = 14;
        var aw = dc.getTextWidthInPixels(a, font);
        var bw = dc.getTextWidthInPixels(b, font);
        var x = (w - aw - bw - 2 * gap - 12) / 2;
        var y = (h * 0.50).toNumber();
        Look.textLeft(dc, x, y, font, a, Look.WHITE);
        dc.setColor(Look.MUTED, Look.MUTED);
        dc.fillRectangle(x + aw + gap, y - 2, 12, 4);
        Look.textLeft(dc, x + aw + 2 * gap + 12, y, font, b, Look.WHITE);
        var won = s["won"] as Array;
        Look.text(dc, w / 2, h * 0.64, Graphics.FONT_XTINY, "GAMES " + (won[0] as Number).toString() + "–" + (won[1] as Number).toString(), Look.MUTED);
        // START: next game (green, as the mark at the button); BACK: undo.
        var bw2 = (w * 0.56).toNumber();
        var by = (h * 0.74).toNumber();
        dc.setColor(Look.GREEN, Look.GREEN);
        dc.fillRoundedRectangle((w - bw2) / 2, by, bw2, 32, 16);
        Look.text(dc, w / 2, by + 16, Graphics.FONT_TINY, "Next game", Look.BLACK);
        Look.text(dc, w / 2, h * 0.90, Graphics.FONT_XTINY, "BACK: undo", Look.MUTED);
        Look.buttonMarks(dc, Look.GREEN, Look.MUTED);
    }

    //! Match won: who, and every game as a column (each game's winner white), then Done.
    function drawMatchWon(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var winner = s["matchWinner"] as Number;
        var who = (winner == 0 ? s["home"] : s["away"]) as String;
        // "JORIS & MAARTEN WIN": a smaller font before the names get shorter.
        var titleY = h * 0.20;
        var fonts = [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY];
        for (var f = 0; f < fonts.size(); f++) {
            var font = fonts[f] as Graphics.FontType;
            var room = Look.widthAt(dc, titleY, 16) - dc.getTextWidthInPixels(" WIN", font);
            var title = Look.name(dc, who, font, room, true);
            if (f == fonts.size() - 1 || title.find("…") == null) {
                Look.text(dc, w / 2, titleY, font, title + " WIN", Look.WHITE);
                break;
            }
        }

        var games = allGames();
        var tableW = Look.widthAt(dc, h * 0.47, 12);
        var colW = (w * 0.14).toNumber();
        var nameW = tableW - games.size() * colW - 8;
        var x0 = (w - tableW) / 2;
        var cx0 = x0 + nameW + 8 + colW / 2;
        for (var i = 0; i < games.size(); i++) {
            Look.text(dc, cx0 + i * colW, h * 0.31, Graphics.FONT_XTINY, (i + 1).toString(), Look.MUTED);
        }
        for (var team = 0; team < 2; team++) {
            var ry = h * (team == 0 ? 0.41 : 0.55);
            var side = (team == 0 ? s["home"] : s["away"]) as String;
            Look.textLeft(dc, x0, ry, Graphics.FONT_XTINY, Look.cut(dc, Look.firstNames(side), Graphics.FONT_XTINY, nameW), team == winner ? Look.WHITE : Look.MUTED);
            for (var i = 0; i < games.size(); i++) {
                var g = games[i] as Array;
                var mine = g[team] as Number;
                var theirs = g[1 - team] as Number;
                Look.text(dc, cx0 + i * colW, ry, Graphics.FONT_MEDIUM, mine.toString(), mine > theirs ? Look.WHITE : Look.FAINT);
            }
        }
        dc.setColor(Look.LINE, Look.LINE);
        dc.fillRectangle(x0, (h * 0.48).toNumber(), tableW, 1);
        Look.text(dc, w / 2, h * 0.66, Graphics.FONT_XTINY, "Saved to the club", Look.MUTED);
        // START: done (outlined); BACK: undo the last point.
        var bw = (w * 0.44).toNumber();
        var by = (h * 0.74).toNumber();
        dc.setColor(Look.WHITE, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawRoundedRectangle((w - bw) / 2, by, bw, 32, 16);
        dc.setPenWidth(1);
        Look.text(dc, w / 2, by + 16, Graphics.FONT_TINY, "Done", Look.WHITE);
        Look.text(dc, w / 2, h * 0.90, Graphics.FONT_XTINY, "BACK: undo", Look.MUTED);
        Look.buttonMarks(dc, Look.WHITE, Look.MUTED);
    }
}

//! UP: point for the team on top · DOWN: for the team below · BACK: undo · START: menu, or the
//! next game when a game is over · a tap on the top or bottom half scores too, when touch scoring
//! is on (menu).
class ScoreDelegate extends WatchUi.BehaviorDelegate {
    private var _view as ScoreView;

    function initialize(view as ScoreView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onKey(evt as WatchUi.KeyEvent) as Boolean {
        var key = evt.getKey();
        if (key == WatchUi.KEY_UP) {
            _view.pointFor(true);
            return true;
        }
        if (key == WatchUi.KEY_DOWN) {
            _view.pointFor(false);
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
        _view.pointFor(y < System.getDeviceSettings().screenHeight / 2);
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
