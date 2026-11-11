package com.freekiosk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TileSliderTest {
  private val width = 1280f

  @Test
  fun switchesPast30PercentEitherWay() {
    assertEquals("left", TileSlider.switchDirection(-400f, 0f, width))
    assertEquals("right", TileSlider.switchDirection(400f, 0f, width))
  }

  @Test
  fun switchesOnAFlickTheSameWayAndSpringsBackOtherwise() {
    assertEquals("left", TileSlider.switchDirection(-100f, -900f, width))
    assertNull("flicked back", TileSlider.switchDirection(-100f, 900f, width))
    assertNull("too short", TileSlider.switchDirection(-20f, -900f, width))
    assertNull("slow and short", TileSlider.switchDirection(-200f, -100f, width))
  }
}
