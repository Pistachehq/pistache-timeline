import { expect, test } from '@playwright/test';

test.describe('web workspace', () => {
  test('loads the shared editor with a default sequence', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('editor')).toBeVisible();
    await expect(page.getByTestId('project-name')).toHaveText('Untitled Project');
    await expect(page.getByTestId('track-header-V1')).toBeVisible();
    await expect(page.getByTestId('track-header-A1')).toBeVisible();
    await expect(page.getByTestId('timeline-panel')).toBeVisible();
    await expect(page.getByTestId('inspector-panel')).toBeVisible();
    await expect(page.getByText('No media imported')).toBeVisible();
    await expect(page.getByText('The sequence is empty')).toBeVisible();
  });

  test('opens the About dialog from the Help menu', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('menuitem', { name: 'Help' }).click();
    await page.getByRole('menuitem', { name: 'About Timeline' }).click();
    await expect(page.getByRole('dialog', { name: 'About Timeline' })).toBeVisible();
    await expect(page.getByText(/independent, community-developed project/i)).toBeVisible();
  });
});
