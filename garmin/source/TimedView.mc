import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

//! A timed game (basketball, football): the clock in the middle, counting down the period, the
//! score of HOME and AWAY under it. UP: a point for HOME, DOWN: for AWAY (in basketball first +1,
//! +2 or +3), START: stop or start the clock, BACK: undo the last point. Points still count while
//! the clock is stopped. When the period's time is up: a screen of its own with the score per
//! period and START for the next period; after the last, who won.
//!
//! The clock runs on the watch from the server's last answer, so it needs no requests to tick;
//! the watch asks every 20 seconds (30 while stopped) to stay sure it has the latest.
class TimedView extends WatchUi.View {
    var club as String;
    var match as String;
    var s as Dictionary; // functions/watch.js timedSummary
    var lastOk as Number = 0;
    var pressBusy as Boolean = false;
    var refusedText as String? = null;
    var refusedUntil as Number = 0;
    private var _pollBusy as Boolean = false;
    private var _nextPoll as Number = 0;
    private var _timer as Timer.Timer?;
    private var _buzzed as Boolean = false; // the period's end, once

    function initialize(clubId as String, matchId as String, first as Dictionary) {
        View.initialize();
        club = clubId;
        match = matchId;
        s = first;
        lastOk = System.getTimer();
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

    function connected() as Boolean {
        var settings = System.getDeviceSettings();
        if (settings has :connectionAvailable) {
            return settings.connectionAvailable;
        }
        return settings.phoneConnected;
    }

    function waitMs() as Number {
        return s["running"] == true ? 20000 : 30000;
    }

    function live() as Boolean {
        return lastOk != 0 && connected() && System.getTimer() - lastOk < waitMs() + 6000;
    }

    //! The time left in the period now, run on from the last answer while the clock runs.
    function leftMs() as Number {
        var left = s["leftMs"] as Number;
        if (s["running"] == true) {
            left -= System.getTimer() - lastOk;
        }
        return left > 0 ? left : 0;
    }

    //! The period's time is up (seen here before the server says so).
    function periodOver() as Boolean {
        if (s["periodOver"] == true) {
            return true;
        }
        if (s["running"] == true && leftMs() == 0) {
            return true;
        }
        return false;
    }

    function onTick() as Void {
        var now = System.getTimer();
        if (s["running"] == true && leftMs() == 0 && !_buzzed) {
            _buzzed = true;
            Look.buzzGame();
            _nextPoll = now; // ask now, so the server's answer confirms it
        }
        if (now >= _nextPoll) {
            poll();
        }
        WatchUi.requestUpdate(); // the clock, every second
    }

    function poll() as Void {
        if (_pollBusy || pressBusy) {
            return;
        }
        _nextPoll = System.getTimer() + waitMs();
        if (!connected()) {
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
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
        }
        WatchUi.requestUpdate();
    }

    function take(d as Dictionary) as Void {
        if ((d["version"] as Number) >= (s["version"] as Number)) {
            s = d;
            if (d["periodOver"] != true) {
                _buzzed = false;
            }
        }
        lastOk = System.getTimer();
    }

    //! 'start', 'pause', 'point0', 'point1' (with n points), 'undo' or 'next'.
    function press(action as String, n as Number) as Void {
        if (!connected()) {
            refuse("No connection to your phone");
            return;
        }
        if (pressBusy) {
            refuse("Still sending your last press");
            return;
        }
        pressBusy = true;
        Api.post("/press", { "club" => club, "match" => match, "basedOn" => s["version"], "action" => action, "n" => n }, method(:onPress));
    }

    function onPress(code as Number, data as Dictionary or String or Null) as Void {
        pressBusy = false;
        if (code == 200 && data instanceof Dictionary) {
            take(data);
            if (data["counted"] == true) {
                refusedUntil = 0;
                if (s["finished"] == true) {
                    Look.buzzDone();
                } else {
                    Look.buzzPoint();
                }
            } else {
                refuse(reason(data["reason"] as String));
            }
        } else if (code == 401) {
            unlinked();
            return;
        } else {
            lastOk = 0;
            refuse(Api.problem(code));
        }
        WatchUi.requestUpdate();
    }

    function reason(why as String) as String {
        if (why.equals("stale")) {
            return "The score had just changed";
        }
        if (why.equals("nothing")) {
            return "Nothing to undo";
        }
        if (why.equals("periodover")) {
            return "Time is up: START for the next";
        }
        if (why.equals("notstarted")) {
            return "Start the clock first";
        }
        if (why.equals("running")) {
            return "Stop the clock first";
        }
        if (why.equals("over")) {
            return "The game is over";
        }
        return "Not now";
    }

    function refuse(text as String) as Void {
        refusedText = text;
        refusedUntil = System.getTimer() + 2600;
        Look.buzzRefused();
        WatchUi.requestUpdate();
    }

    //! START: the clock on or off; when the time is up the next period; after the game, done.
    function start() as Void {
        if (s["finished"] == true) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
        } else if (periodOver()) {
            press("next", 0);
        } else {
            press(s["running"] == true ? "pause" : "start", 0);
        }
    }

    //! A point for a team: in basketball first the choice of 1, 2 or 3.
    function pointFor(team as Number) as Void {
        var values = s["values"] as Array;
        if (values.size() > 1) {
            var pick = new PointsView(self, team);
            WatchUi.pushView(pick, new PointsDelegate(pick), WatchUi.SLIDE_UP);
        } else {
            press("point" + team.toString(), values[0] as Number);
        }
    }

    // ---------- drawing ----------

    //! "Q2", "1ST HALF": the name of period p (1, 2, …).
    function periodName(p as Number) as String {
        if ((s["periods"] as Number) == 4) {
            return "Q" + p.toString();
        }
        return p == 1 ? "1ST HALF" : p == 2 ? "2ND HALF" : "PERIOD " + p.toString();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var now = System.getTimer();
        dc.setColor(Look.BLACK, Look.BLACK);
        dc.clear();
        if (s["finished"] == true) {
            drawFinished(dc);
        } else if (periodOver()) {
            drawPeriodOver(dc);
        } else {
            drawClock(dc);
        }
        if (refusedText != null && now < refusedUntil) {
            Look.card(dc, "NOT COUNTED", refusedText as String, Look.ORANGE);
        } else if (!live()) {
            Look.card(dc, "SCORING PAUSED", "No connection: checking…", Look.CARD);
        }
    }

    function drawClock(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var running = s["running"] == true;
        var state = !live() ? "OFFLINE" : running ? "LIVE" : "PAUSED";
        var color = !live() ? Look.ORANGE : running ? Look.GREEN : Look.MUTED;
        var label = state + " · " + periodName(s["period"] as Number);
        var top = (h * 0.16).toNumber();
        var lw = dc.getTextWidthInPixels(label, Graphics.FONT_XTINY);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        if (running) {
            dc.fillCircle(w / 2 - lw / 2 - 8, top, 4);
        } else {
            dc.fillRectangle(w / 2 - lw / 2 - 12, top - 4, 3, 9);
            dc.fillRectangle(w / 2 - lw / 2 - 7, top - 4, 3, 9);
        }
        Look.text(dc, w / 2 + 4, top, Graphics.FONT_XTINY, label, color);

        // The clock, in the middle; dimmed while stopped.
        Look.text(dc, w / 2, h * 0.38, Graphics.FONT_NUMBER_MEDIUM, Look.clock(leftMs()), running ? Look.WHITE : Look.MUTED);

        // HOME and AWAY, each with its score on a card.
        var score = s["score"] as Array;
        for (var t = 0; t < 2; t++) {
            var cx = (w * (t == 0 ? 0.31 : 0.69)).toNumber();
            var name = t == 0 ? s["home"] as String : s["away"] as String;
            Look.text(dc, cx, h * 0.58, Graphics.FONT_XTINY, Look.name(dc, name, Graphics.FONT_XTINY, (w * 0.34).toNumber(), true), Look.WHITE);
            var text = (score[t] as Number).toString();
            var font = Graphics.FONT_NUMBER_MILD;
            var cw = dc.getTextWidthInPixels(text, font) + 16;
            var ch = (h * 0.19).toNumber();
            dc.setColor(Look.CARD, Look.CARD);
            dc.fillRoundedRectangle(cx - cw / 2, (h * 0.64).toNumber(), cw, ch, 10);
            Look.text(dc, cx, (h * 0.64).toNumber() + ch / 2, font, text, Look.WHITE);
        }
        Look.text(dc, w / 2, (h * 0.735).toNumber(), Graphics.FONT_SMALL, "–", Look.FAINT);
    }

    //! The total, then each period played.
    function drawScores(dc as Graphics.Dc, y as Number) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var score = s["score"] as Array;
        var a = (score[0] as Number).toString();
        var b = (score[1] as Number).toString();
        var font = Graphics.FONT_NUMBER_MILD;
        var aw = dc.getTextWidthInPixels(a, font);
        var bw = dc.getTextWidthInPixels(b, font);
        var x = (w - aw - bw - 36) / 2;
        Look.textLeft(dc, x, y, font, a, Look.WHITE);
        dc.setColor(Look.MUTED, Look.MUTED);
        dc.fillRectangle(x + aw + 12, y - 2, 12, 4);
        Look.textLeft(dc, x + aw + 36, y, font, b, Look.WHITE);
        // Each period, up to the last four.
        var periods = (s["past"] as Array).slice(0, null) as Array;
        periods.add(lastPeriod()); // the period just played isn't in "past" (only those before it)
        var row = y + (h * 0.13).toNumber();
        for (var i = 0; i < periods.size(); i++) {
            var p = periods[i] as Array;
            Look.text(dc, w / 2, row + i * (h * 0.075).toNumber(), Graphics.FONT_XTINY,
                periodName(i + 1) + "   " + (p[0] as Number).toString() + " – " + (p[1] as Number).toString(), Look.MUTED);
        }
    }

    //! This period's score: the total less the periods before.
    function lastPeriod() as Array {
        var score = s["score"] as Array;
        var a = score[0] as Number;
        var b = score[1] as Number;
        var past = s["past"] as Array;
        for (var i = 0; i < past.size(); i++) {
            a -= (past[i] as Array)[0] as Number;
            b -= (past[i] as Array)[1] as Number;
        }
        return [a, b];
    }

    function drawPeriodOver(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var p = s["period"] as Number;
        var periods = s["periods"] as Number;
        var last = p >= periods;
        var title = last ? "FULL TIME" : p * 2 == periods ? "HALF-TIME" : "END OF " + periodName(p);
        Look.text(dc, w / 2, h * 0.15, Graphics.FONT_XTINY, title, Look.MUTED);
        drawScores(dc, (h * 0.29).toNumber());
        var bw = (w * 0.62).toNumber();
        var by = (h * 0.70).toNumber();
        var bh = (h * 0.14).toNumber();
        dc.setColor(Look.GREEN, Look.GREEN);
        dc.fillRoundedRectangle((w - bw) / 2, by, bw, bh, bh / 2);
        var next = last ? "Finish" : "Start " + (periods == 4 ? "Q" + (p + 1).toString() : "2nd half");
        Look.text(dc, w / 2, by + bh / 2, Graphics.FONT_TINY, next, Look.BLACK);
        Look.text(dc, w / 2, h * 0.90, Graphics.FONT_XTINY, "BACK: undo", Look.MUTED);
        Look.buttonMarks(dc, Look.GREEN, Look.MUTED);
    }

    function drawFinished(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var winner = s["winner"];
        var title = winner == null ? "DRAW" : Look.name(dc, (winner == 0 ? s["home"] : s["away"]) as String, Graphics.FONT_SMALL, Look.widthAt(dc, h * 0.17, 40), true) + " WIN";
        Look.text(dc, w / 2, h * 0.17, Graphics.FONT_SMALL, title, Look.WHITE);
        drawScores(dc, (h * 0.31).toNumber());
        Look.text(dc, w / 2, h * 0.66, Graphics.FONT_XTINY, "Saved to your games", Look.MUTED);
        var bw = (w * 0.44).toNumber();
        var by = (h * 0.72).toNumber();
        dc.setColor(Look.WHITE, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawRoundedRectangle((w - bw) / 2, by, bw, 32, 16);
        dc.setPenWidth(1);
        Look.text(dc, w / 2, by + 16, Graphics.FONT_TINY, "Done", Look.WHITE);
        Look.text(dc, w / 2, h * 0.90, Graphics.FONT_XTINY, "BACK: undo", Look.MUTED);
        Look.buttonMarks(dc, Look.WHITE, Look.MUTED);
    }
}

class TimedDelegate extends WatchUi.BehaviorDelegate {
    private var _view as TimedView;

    function initialize(view as TimedView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onKey(evt as WatchUi.KeyEvent) as Boolean {
        var key = evt.getKey();
        var playing = _view.s["finished"] != true;
        if ((key == WatchUi.KEY_UP || key == WatchUi.KEY_DOWN) && playing) {
            _view.pointFor(key == WatchUi.KEY_UP ? 0 : 1);
            return true;
        }
        if (key == WatchUi.KEY_ESC) {
            _view.press("undo", 0);
            return true;
        }
        if (key == WatchUi.KEY_ENTER) {
            _view.start();
            return true;
        }
        return false;
    }

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        if (Api.touchScoring() && _view.s["finished"] != true && !_view.periodOver()) {
            var y = evt.getCoordinates()[1];
            var h = System.getDeviceSettings().screenHeight;
            if (y < h * 0.5) {
                _view.start(); // the clock
            } else {
                _view.pointFor(evt.getCoordinates()[0] < System.getDeviceSettings().screenWidth / 2 ? 0 : 1);
            }
        }
        return true;
    }

    function onSwipe(evt as WatchUi.SwipeEvent) as Boolean {
        return true;
    }

    function onBack() as Boolean {
        return true;
    }

    function onMenu() as Boolean {
        Menus.showTimed(_view);
        return true;
    }
}

// ---------- basketball: +1, +2 or +3 ----------

//! HOME SCORES: +1, +2 or +3; the usual (+2) is chosen, and counts by itself after 2 seconds.
//! UP / DOWN choose (and wait again), START counts it now, BACK cancels.
class PointsView extends WatchUi.View {
    var game as TimedView;
    var team as Number;
    var values as Array;
    var selected as Number;
    private var _timer as Timer.Timer?;

    function initialize(g as TimedView, t as Number) {
        View.initialize();
        game = g;
        team = t;
        values = g.s["values"] as Array;
        var i = values.indexOf(g.s["usual"] as Number);
        selected = i < 0 ? 0 : i;
    }

    function onShow() as Void {
        again();
    }

    function onHide() as Void {
        if (_timer != null) {
            _timer.stop();
            _timer = null;
        }
    }

    function again() as Void {
        if (_timer != null) {
            _timer.stop();
        }
        _timer = new Timer.Timer();
        _timer.start(method(:count), 2000, false);
    }

    function count() as Void {
        if (_timer == null) {
            return;
        }
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        game.press("point" + team.toString(), values[selected] as Number);
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Look.BLACK, Look.BLACK);
        dc.clear();
        var name = team == 0 ? game.s["home"] as String : game.s["away"] as String;
        Look.text(dc, w / 2, h * 0.27, Graphics.FONT_TINY, Look.name(dc, name, Graphics.FONT_TINY, Look.widthAt(dc, h * 0.27, 30) - 70, true) + " SCORES", Look.WHITE);
        var n = values.size();
        var gap = 6;
        var bw = ((w * 0.78).toNumber() - gap * (n - 1)) / n;
        var bh = (h * 0.26).toNumber();
        var x0 = (w - (bw * n + gap * (n - 1))) / 2;
        var y = (h * 0.38).toNumber();
        for (var i = 0; i < n; i++) {
            var on = i == selected;
            var x = x0 + i * (bw + gap);
            dc.setColor(on ? Look.GREEN : Look.CARD, on ? Look.GREEN : Look.CARD);
            dc.fillRoundedRectangle(x, y, bw, bh, 12);
            Look.text(dc, x + bw / 2, y + bh / 2, Graphics.FONT_MEDIUM, "+" + (values[i] as Number).toString(), on ? Look.BLACK : Look.WHITE);
        }
        Look.text(dc, w / 2, h * 0.75, Graphics.FONT_XTINY, "+" + (values[selected] as Number).toString() + " counts by itself in 2 s", Look.MUTED);
        Look.buttonMarks(dc, Look.GREEN, Look.MUTED);
    }
}

class PointsDelegate extends WatchUi.BehaviorDelegate {
    private var _view as PointsView;

    function initialize(view as PointsView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onKey(evt as WatchUi.KeyEvent) as Boolean {
        var key = evt.getKey();
        var n = _view.values.size();
        if (key == WatchUi.KEY_UP || key == WatchUi.KEY_DOWN) {
            _view.selected = (_view.selected + (key == WatchUi.KEY_DOWN ? 1 : n - 1)) % n;
            _view.again();
            WatchUi.requestUpdate();
            return true;
        }
        if (key == WatchUi.KEY_ENTER) {
            _view.count();
            return true;
        }
        if (key == WatchUi.KEY_ESC) {
            _view.onHide();
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return true;
        }
        return false;
    }

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        var x = evt.getCoordinates()[0];
        var w = System.getDeviceSettings().screenWidth;
        var n = _view.values.size();
        var i = (x - w * 0.11) * n / (w * 0.78);
        _view.selected = i < 0 ? 0 : i >= n ? n - 1 : i.toNumber();
        _view.count();
        return true;
    }
}
