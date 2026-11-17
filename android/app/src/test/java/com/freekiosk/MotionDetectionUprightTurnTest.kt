package com.freekiosk

import android.media.ExifInterface
import org.junit.Assert.assertEquals
import org.junit.Test

/** The turn that makes a photo upright for the face check, from its EXIF orientation. */
class MotionDetectionUprightTurnTest {
  private fun turn(orientation: Int) = MotionDetectionModule.uprightTurn(orientation)

  @Test
  fun plainRotations() {
    assertEquals(0, turn(ExifInterface.ORIENTATION_NORMAL))
    assertEquals(90, turn(ExifInterface.ORIENTATION_ROTATE_90))
    assertEquals(180, turn(ExifInterface.ORIENTATION_ROTATE_180))
    assertEquals(270, turn(ExifInterface.ORIENTATION_ROTATE_270))
    assertEquals(0, turn(ExifInterface.ORIENTATION_UNDEFINED))
  }

  @Test
  fun mirroredPhotosTurnWithoutTheFlip() {
    assertEquals(0, turn(ExifInterface.ORIENTATION_FLIP_HORIZONTAL))
    assertEquals(180, turn(ExifInterface.ORIENTATION_FLIP_VERTICAL))
    // A Galaxy A52s front camera held upright tags TRANSVERSE; turning it 90 left it upside down
    assertEquals(270, turn(ExifInterface.ORIENTATION_TRANSVERSE))
    assertEquals(90, turn(ExifInterface.ORIENTATION_TRANSPOSE))
  }
}
