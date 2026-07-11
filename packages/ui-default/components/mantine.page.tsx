import { createTheme, Notification as MantineNotification } from '@mantine/core';
import { AutoloadPage } from 'vj/misc/Page';

const colorWhite = {
  color: 'var(--mantine-color-white)',
} as const;

export const theme = createTheme({
  components: {
    Notification: MantineNotification.extend({
      classNames: {
        closeButton: 'mantine-notifications-close-button',
      },
      styles: {
        root: {
          backgroundColor: 'var(--notification-color, var(--mantine-primary-color-filled))',
          paddingInlineStart: 'var(--mantine-spacing-xs)',
        },
        title: {
          ...colorWhite,
          fontSize: 'var(--mantine-font-size-md)',
        },
        icon: {
          fontSize: '24px',
          marginInlineEnd: 'var(--mantine-spacing-xs)',
        },
        description: colorWhite,
        closeButton: colorWhite,
      },
    }),
  },
});

export default new AutoloadPage('mantine', null, () => {
  localStorage.setItem(
    'mantine-color-scheme-value',
    document.documentElement.className.includes('theme--dark') ? 'dark' : 'light',
  );
});
