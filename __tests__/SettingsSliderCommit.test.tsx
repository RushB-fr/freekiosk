/**
 * A D-pad (Android TV) moves the slider thumb without ever ending a slide, so the parent used to
 * get nothing (the value was lost on Save). The value is now handed over once it stops changing,
 * straight away at the end of a touch slide, and when the slider goes away with one waiting.
 */
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const Slider = require('@react-native-community/slider').default;
const SettingsSlider = require('../src/components/settings/SettingsSlider').default;

const mount = (onValueChange: jest.Mock, value = 0) => {
  let renderer: any;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(SettingsSlider, {
        label: 'Fade', value, onValueChange, minimumValue: 0, maximumValue: 30, step: 1,
        formatValue: (v: number) => `${Math.round(v)} s`,
      })
    );
  });
  return renderer;
};
const slider = (renderer: any) => renderer.root.findByType(Slider);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('SettingsSlider commit', () => {
  it('hands over a D-pad change once it stops changing, with the last value', () => {
    const onChange = jest.fn();
    const r = mount(onChange);
    // Ten presses of RIGHT, 100 ms apart: onValueChange fires, onSlidingComplete never does
    for (let i = 1; i <= 10; i++) {
      act(() => { slider(r).props.onValueChange(i); });
      act(() => { jest.advanceTimersByTime(100); });
    }
    expect(onChange).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(400); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('commits at once at the end of a touch slide and does not commit twice', () => {
    const onChange = jest.fn();
    const r = mount(onChange);
    act(() => { slider(r).props.onValueChange(7); });
    act(() => { slider(r).props.onSlidingComplete(7); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(7);
    act(() => { jest.advanceTimersByTime(2000); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('hands over a change that is still waiting when the slider goes away', () => {
    const onChange = jest.fn();
    const r = mount(onChange);
    act(() => { slider(r).props.onValueChange(5); });
    act(() => { r.unmount(); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(5);
    act(() => { jest.advanceTimersByTime(2000); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('commits nothing when the value was never changed', () => {
    const onChange = jest.fn();
    const r = mount(onChange, 4);
    act(() => { jest.advanceTimersByTime(2000); });
    act(() => { r.unmount(); });
    expect(onChange).not.toHaveBeenCalled();
  });
});
