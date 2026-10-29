import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;

//! Talks to the Skoor server (functions/watch.js). A Garmin watch reaches the internet through the
//! Garmin Connect app on the phone, over Bluetooth. Answers are JSON.
module Api {
    const BASE = "https://europe-west1-badminton-dev-bc258.cloudfunctions.net/watch";
    const TOKEN_KEY = "token";
    const TOUCH_KEY = "touch";

    //! This watch's own key for the account it's linked to, or null when not linked (yet).
    function token() as String? {
        var t = Application.Storage.getValue(TOKEN_KEY);
        return t instanceof String ? t : null;
    }

    function setToken(t as String?) as Void {
        if (t == null) {
            Application.Storage.deleteValue(TOKEN_KEY);
        } else {
            Application.Storage.setValue(TOKEN_KEY, t);
        }
    }

    //! Whether a tap on the screen scores. Off by default on watches with UP and DOWN buttons
    //! (against accidental taps), on for watches that are mostly touch.
    function touchScoring() as Boolean {
        var t = Application.Storage.getValue(TOUCH_KEY);
        if (t instanceof Boolean) {
            return t;
        }
        var settings = System.getDeviceSettings();
        if (!settings.isTouchScreen) {
            return false;
        }
        if (settings has :inputButtons) {
            return (settings.inputButtons & System.BUTTON_INPUT_UP) == 0;
        }
        return true;
    }

    function setTouchScoring(on as Boolean) as Void {
        Application.Storage.setValue(TOUCH_KEY, on);
    }

    //! A switch kept on the watch, on unless switched off: "myUp" (your own team on top and on UP,
    //! when you play in the match) and "alerts" (the interval and change of ends, with a buzz).
    function isOn(key as String) as Boolean {
        var v = Application.Storage.getValue(key);
        return v instanceof Boolean ? v as Boolean : true;
    }

    function setOn(key as String, on as Boolean) as Void {
        Application.Storage.setValue(key, on);
    }

    function headers(json as Boolean) as Dictionary {
        var h = {};
        if (json) {
            h["Content-Type"] = Communications.REQUEST_CONTENT_TYPE_JSON;
        }
        var t = token();
        if (t != null) {
            h["Authorization"] = "Bearer " + t;
        }
        return h;
    }

    function get(path as String, params as Dictionary?, callback as Method(code as Number, data as Dictionary or String or Null) as Void) as Void {
        Communications.makeWebRequest(BASE + path, params as Dictionary<Object, Object>?, {
            :method => Communications.HTTP_REQUEST_METHOD_GET,
            :headers => headers(false),
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, callback);
    }

    function post(path as String, body as Dictionary, callback as Method(code as Number, data as Dictionary or String or Null) as Void) as Void {
        Communications.makeWebRequest(BASE + path, body as Dictionary<Object, Object>, {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => headers(true),
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, callback);
    }

    //! A short text for a failed request: no phone, or the server's answer code.
    function problem(code as Number) as String {
        if (code == Communications.BLE_CONNECTION_UNAVAILABLE) {
            return "No phone: open Garmin Connect";
        }
        if (code < 0) {
            return "No connection (" + code.toString() + ")";
        }
        return "Skoor didn't answer (" + code.toString() + ")";
    }
}
