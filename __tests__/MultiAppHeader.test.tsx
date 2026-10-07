import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Image, Text } from 'react-native';
import MultiAppHeader from '../src/components/MultiAppHeader';
import { DEFAULT_MULTI_APP_APPEARANCE } from '../src/types/multiAppAppearance';

it('shows a custom heading and logo, and falls back when the logo fails', async () => {
  let tree!: renderer.ReactTestRenderer;
  const appearance = {
    ...DEFAULT_MULTI_APP_APPEARANCE,
    title: 'Reception',
    logoUri: 'file:///logo.png',
    backgroundColor: '#ffffff',
  };
  await act(async () => {
    tree = renderer.create(<MultiAppHeader appearance={appearance} />);
  });
  expect(tree.root.findByType(Text).props.children).toBe('Reception');
  expect(tree.root.findByType(Image).props.source).toEqual({
    uri: 'file:///logo.png',
  });
  await act(async () => {
    tree.root.findByType(Image).props.onError();
  });
  expect(tree.root.findByType(Image).props.source).toEqual(
    require('../src/assets/images/logo_circle.png'),
  );
  await act(async () => {
    tree.update(
      <MultiAppHeader
        appearance={{ ...appearance, logoUri: 'file:///new-logo.png' }}
      />,
    );
  });
  expect(tree.root.findByType(Image).props.source).toEqual({
    uri: 'file:///new-logo.png',
  });
  await act(async () => {
    tree.unmount();
  });
});

it('hides the heading and logo independently and removes an empty header', async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <MultiAppHeader
        appearance={{ ...DEFAULT_MULTI_APP_APPEARANCE, showLogo: false }}
      />,
    );
  });
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  expect(tree.root.findAllByType(Text)).toHaveLength(1);
  await act(async () => {
    tree.update(
      <MultiAppHeader
        appearance={{ ...DEFAULT_MULTI_APP_APPEARANCE, showTitle: false }}
      />,
    );
  });
  expect(tree.root.findAllByType(Image)).toHaveLength(1);
  expect(tree.root.findAllByType(Text)).toHaveLength(0);
  await act(async () => {
    tree.update(
      <MultiAppHeader
        appearance={{
          ...DEFAULT_MULTI_APP_APPEARANCE,
          showLogo: false,
          title: '',
        }}
      />,
    );
  });
  expect(tree.toJSON()).toBeNull();
  await act(async () => {
    tree.unmount();
  });
});
