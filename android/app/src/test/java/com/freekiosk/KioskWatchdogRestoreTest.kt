package com.freekiosk

import com.freekiosk.KioskWatchdogService.Companion.RESTORE_MIN_INTERVAL_MS
import com.freekiosk.KioskWatchdogService.Companion.shouldRestoreAfterProcessDeath
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** #376: when the watchdog brings MainActivity back after the process died. */
class KioskWatchdogRestoreTest {
  private val now = 10_000_000L

  private fun restore(
    activityStarted: Boolean = false,
    runsUnattended: Boolean = true,
    deviceInteractive: Boolean = false,
    lastRestoreMs: Long = 0L,
  ) = shouldRestoreAfterProcessDeath(activityStarted, runsUnattended, deviceInteractive, lastRestoreMs, now)

  @Test
  fun restoresWhenAnUnattendedDeviceCameBackWithoutItsActivityAndTheScreenIsOff() {
    assertTrue(restore())
  }

  @Test
  fun leavesAloneAnActivityThatAlreadyStartedInThisProcess() {
    // The user left the app, or a launch from the update receiver is already under way.
    assertFalse(restore(activityStarted = true))
  }

  @Test
  fun leavesAloneADeviceThatIsNotMeantToRunUnattended() {
    assertFalse(restore(runsUnattended = false))
  }

  @Test
  fun leavesAloneALitScreenSoAnotherAppInUseIsNotCoveredAgain() {
    // #234: never drag FreeKiosk over what the user is doing.
    assertFalse(restore(deviceInteractive = true))
  }

  @Test
  fun doesNotRestoreAgainWithinTheMinimumInterval() {
    assertFalse(restore(lastRestoreMs = now - RESTORE_MIN_INTERVAL_MS + 1))
  }

  @Test
  fun restoresAgainOnceTheIntervalHasPassed() {
    assertTrue(restore(lastRestoreMs = now - RESTORE_MIN_INTERVAL_MS))
  }
}
