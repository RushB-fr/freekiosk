/**
 * The Settings banner that points to FreeKiosk Cloud: shown to a tablet that is not
 * enrolled, gone once it is enrolled, and gone for good once the user closes it.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockIsEnrolled = jest.fn();
const mockIsDismissed = jest.fn();
const mockDismiss = jest.fn(() => Promise.resolve());

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../src/components/Icon', () => 'Icon');
jest.mock('../src/utils/CloudSyncService', () => ({
  CloudSyncService: { isEnrolled: () => mockIsEnrolled() },
}));
jest.mock('../src/utils/storage', () => ({
  StorageService: {
    isCloudPromoDismissed: () => mockIsDismissed(),
    dismissCloudPromo: () => mockDismiss(),
  },
}));

import CloudPromoBanner from '../src/components/settings/CloudPromoBanner';

const render = async (props: { onConnect?: () => void; refreshKey?: string } = {}) => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <CloudPromoBanner onConnect={props.onConnect ?? jest.fn()} refreshKey={props.refreshKey} />,
    );
  });
  return renderer;
};

const find = (renderer: ReactTestRenderer.ReactTestRenderer, testID: string) =>
  renderer.root.findAll((node) => node.props.testID === testID);

describe('CloudPromoBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsEnrolled.mockResolvedValue(false);
    mockIsDismissed.mockResolvedValue(false);
  });

  it('shows for a tablet that is not enrolled', async () => {
    const renderer = await render();
    expect(find(renderer, 'cloud-promo-banner').length).toBeGreaterThan(0);
  });

  it('is hidden once the tablet is enrolled', async () => {
    mockIsEnrolled.mockResolvedValue(true);
    const renderer = await render();
    expect(find(renderer, 'cloud-promo-banner')).toHaveLength(0);
  });

  it('is hidden after the user closed it', async () => {
    mockIsDismissed.mockResolvedValue(true);
    const renderer = await render();
    expect(find(renderer, 'cloud-promo-banner')).toHaveLength(0);
  });

  it('closing it hides it and remembers the choice', async () => {
    const renderer = await render();
    const close = find(renderer, 'cloud-promo-dismiss')[0];
    await act(async () => {
      close.props.onPress();
    });
    expect(find(renderer, 'cloud-promo-banner')).toHaveLength(0);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it('hides when the tablet gets enrolled while Settings is open', async () => {
    const renderer = await render({ refreshKey: 'general' });
    expect(find(renderer, 'cloud-promo-banner').length).toBeGreaterThan(0);

    mockIsEnrolled.mockResolvedValue(true);
    await act(async () => {
      renderer.update(<CloudPromoBanner onConnect={jest.fn()} refreshKey="advanced" />);
    });
    expect(find(renderer, 'cloud-promo-banner')).toHaveLength(0);
  });
});
