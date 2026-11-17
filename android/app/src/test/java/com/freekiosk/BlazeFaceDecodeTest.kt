package com.freekiosk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Decoding of BlazeFace's outputs, with fabricated tensors instead of the model. */
class BlazeFaceDecodeTest {
  private val n = BlazeFaceDetector.ANCHORS.size
  private val boxes = Array(n) { FloatArray(16) }
  private val scores = Array(n) { floatArrayOf(-10f) } // sigmoid ~0, below the minimum

  private fun fire(anchor: Int, logit: Float, dx: Float, dy: Float, w: Float, h: Float) {
    scores[anchor][0] = logit
    boxes[anchor][0] = dx
    boxes[anchor][1] = dy
    boxes[anchor][2] = w
    boxes[anchor][3] = h
  }

  private fun assertBox(face: BlazeFaceDetector.Face, left: Float, top: Float, right: Float, bottom: Float) {
    assertEquals(left, face.left, 1e-3f)
    assertEquals(top, face.top, 1e-3f)
    assertEquals(right, face.right, 1e-3f)
    assertEquals(bottom, face.bottom, 1e-3f)
  }

  @Test
  fun hasThe896AnchorsOfTheShortRangeModel() {
    assertEquals(896, n)
    // First anchor: centre of the top left cell of the 16x16 grid
    assertEquals(0.5f / 16, BlazeFaceDetector.ANCHORS[0].first, 1e-6f)
    // Anchor 512 starts the 8x8 grid
    assertEquals(0.5f / 8, BlazeFaceDetector.ANCHORS[512].first, 1e-6f)
  }

  @Test
  fun findsNothingWhenNoAnchorScores() {
    assertTrue(BlazeFaceDetector.decode(boxes, scores, 1f, 0f, 0f).isEmpty())
  }

  @Test
  fun placesTheBoxAroundTheAnchorCentrePlusItsOffset() {
    // Anchor 0 is centred at (4, 4) input pixels
    fire(0, logit = 2f, dx = 10f, dy = 20f, w = 30f, h = 40f)
    val faces = BlazeFaceDetector.decode(boxes, scores, 1f, 0f, 0f)
    assertEquals(1, faces.size)
    assertEquals(0.8808f, faces[0].score, 1e-4f)
    assertBox(faces[0], -1f, 4f, 29f, 44f)
  }

  @Test
  fun undoesTheLetterboxing() {
    // A 1280x960 frame: scale 0.1, so it fills 128x96 with 16 px bars above and below.
    // Anchor of the 8x8 grid in cell x=5, y=3, centred at (88, 56) input pixels.
    val anchor = 512 + 6 * (3 * 8 + 5)
    fire(anchor, logit = 3f, dx = 0f, dy = 0f, w = 16f, h = 16f)
    val faces = BlazeFaceDetector.decode(boxes, scores, 0.1f, 0f, 16f)
    assertEquals(1, faces.size)
    assertBox(faces[0], 800f, 320f, 960f, 480f)
  }

  @Test
  fun keepsTheBestOfOverlappingDetectionsAndSeparateFaces() {
    fire(0, logit = 1f, dx = 20f, dy = 20f, w = 30f, h = 30f) // 0.73
    fire(1, logit = 3f, dx = 21f, dy = 20f, w = 30f, h = 30f) // 0.95, same face
    fire(895, logit = 2f, dx = 0f, dy = 0f, w = 20f, h = 20f) // 0.88, bottom right
    val faces = BlazeFaceDetector.decode(boxes, scores, 1f, 0f, 0f)
    assertEquals(listOf(0.9526f, 0.8808f), faces.map { Math.round(it.score * 1e4f) / 1e4f })
    assertBox(faces[0], 10f, 9f, 40f, 39f)
  }
}
