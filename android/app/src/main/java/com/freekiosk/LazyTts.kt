package com.freekiosk

import android.content.Context
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.util.Log

/**
 * Actions waiting for a value that arrives later (the TTS engine finishing its init).
 * Separate from LazyTts so the ordering can be tested on the JVM.
 */
class PendingActions<T> {
    private var settled = false
    private var value: T? = null
    private val queue = mutableListOf<(T?) -> Unit>()

    fun run(action: (T?) -> Unit) {
        var runNow = false
        var result: T? = null
        synchronized(this) {
            if (settled) {
                runNow = true
                result = value
            } else {
                queue += action
            }
        }
        // Outside the lock: an action may call back into run()
        if (runNow) action(result)
    }

    fun settle(result: T?) {
        val toRun = synchronized(this) {
            settled = true
            value = result
            queue.toList().also { queue.clear() }
        }
        toRun.forEach { it(result) }
    }

    @Synchronized
    fun reset() {
        settled = false
        value = null
        queue.clear()
    }
}

/**
 * Text-to-speech that binds the engine on first use. HttpServerModule and MqttModule each
 * bound one in their constructor, so every start connected two TTS engines that most kiosks
 * never use.
 */
class LazyTts(private val context: Context, private val tag: String) {
    private var tts: TextToSpeech? = null
    private val ready = PendingActions<TextToSpeech>()

    /** Runs [action] once the engine is up, with null if it failed to start. */
    fun use(action: (TextToSpeech?) -> Unit) {
        synchronized(this) { if (tts == null) create() }
        ready.run(action)
    }

    fun stop() {
        tts?.stop()
    }

    @Synchronized
    fun shutdown() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        ready.reset()
    }

    // Called with the lock held
    private fun create() {
        ready.reset()
        try {
            // The system's preferred engine, so installed language packs (e.g. Chinese) are
            // available: the no-arg constructor may pick a more limited engine.
            val engine = Settings.Secure.getString(context.contentResolver, "tts_default_engine")
            val listener = TextToSpeech.OnInitListener { status ->
                if (status == TextToSpeech.SUCCESS) {
                    Log.d(tag, "TextToSpeech initialized (engine=$engine)")
                    // create() holds the lock until `tts` is assigned, so a callback that
                    // arrives on the main thread first waits instead of settling with null
                    ready.settle(synchronized(this) { tts })
                } else {
                    Log.e(tag, "TextToSpeech initialization failed: $status")
                    synchronized(this) {
                        tts?.shutdown()
                        tts = null
                    }
                    ready.settle(null)
                }
            }
            tts = if (!engine.isNullOrEmpty()) {
                TextToSpeech(context, listener, engine)
            } else {
                TextToSpeech(context, listener)
            }
        } catch (e: Exception) {
            Log.e(tag, "Failed to initialize TTS: ${e.message}")
            tts = null
            ready.settle(null)
        }
    }
}
