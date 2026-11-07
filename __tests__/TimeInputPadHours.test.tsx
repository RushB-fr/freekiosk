/**
 * TimeInput hands out "HH:MM" even before the field loses focus.
 *
 * "7:00" passes the regex, and the screen schedule and the URL planner compare times as
 * strings: "22:00" < "7:00", so a 22:00 to 7:00 night rule never slept after midnight when
 * Save was tapped without leaving the field first.
 */
import React from 'react';
import { TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import TimeInput from '../src/components/settings/TimeInput';

test('a single-digit hour is padded as soon as the time is valid', async () => {
  const onChange = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<TimeInput label="Wake" value="" onChange={onChange} />);
  });
  const input = renderer.root.findByType(TextInput);

  await act(async () => input.props.onChangeText('7:00'));

  expect(onChange).toHaveBeenLastCalledWith('07:00');
  expect(onChange).not.toHaveBeenCalledWith('7:00');
});
