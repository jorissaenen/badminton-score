package it.skoor.wear

import android.content.Context
import android.os.VibrationEffect
import android.os.VibratorManager

// The buzzes, the same as on the Garmin watch: a short one for a point, a double one for a game, a
// long one for the match, and a low double one when a press doesn't count.
class Haptics(context: Context) {
    private val vibrator = context.getSystemService(VibratorManager::class.java).defaultVibrator

    private fun buzz(vararg timings: Long) {
        if (vibrator.hasVibrator()) vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, *timings), -1))
    }

    fun point() = buzz(60)
    fun game() = buzz(80, 100, 80)
    fun done() = buzz(500)
    fun refused() = buzz(90, 70, 90)
}
