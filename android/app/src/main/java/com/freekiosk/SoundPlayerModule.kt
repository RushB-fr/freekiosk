package com.freekiosk

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * Plays a one-off remote sound (cloud `play_sound` command) and stops it
 * (`audio_stop`). Backed by a single reusable MediaPlayer, managed on the UI
 * thread so its async prepare/completion callbacks have a Looper.
 */
class SoundPlayerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SoundPlayer"

    companion object {
        private const val TAG = "SoundPlayer"
    }

    private var player: MediaPlayer? = null

    /** Start streaming and playing [url]. Any currently-playing sound is stopped first. */
    @ReactMethod
    fun playSound(url: String?, promise: Promise) {
        if (url.isNullOrEmpty()) {
            promise.reject("BAD_URL", "Sound URL is empty")
            return
        }
        UiThreadUtil.runOnUiThread {
            try {
                releasePlayer()
                player = MediaPlayer().apply {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build()
                    )
                    setDataSource(url)
                    setOnPreparedListener { it.start() }
                    setOnCompletionListener { releasePlayer() }
                    setOnErrorListener { _, what, extra ->
                        Log.e(TAG, "MediaPlayer error (what=$what, extra=$extra)")
                        releasePlayer()
                        true
                    }
                    prepareAsync()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to play sound: ${e.message}", e)
                releasePlayer()
            }
        }
        // Fire-and-forget: playback is asynchronous, the command is "accepted" here.
        promise.resolve(true)
    }

    /** Stop and release any currently-playing sound. */
    @ReactMethod
    fun stopSound(promise: Promise) {
        UiThreadUtil.runOnUiThread { releasePlayer() }
        promise.resolve(true)
    }

    private fun releasePlayer() {
        player?.let {
            try {
                if (it.isPlaying) it.stop()
            } catch (_: Exception) {
                // ignore illegal-state if not started
            }
            try {
                it.release()
            } catch (_: Exception) {
            }
        }
        player = null
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        UiThreadUtil.runOnUiThread { releasePlayer() }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN built-in EventEmitter calls
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN built-in EventEmitter calls
    }
}
