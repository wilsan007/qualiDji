import { test, expect } from '@playwright/test'

test.describe('Home page', () => {
  test('displays hero in French by default', async ({ page }) => {
    await page.goto('/fr')
    await expect(page.locator('h1')).toContainText('quoi faire')
  })

  test('displays hero in English', async ({ page }) => {
    await page.goto('/en')
    await expect(page.locator('h1')).toContainText('what to do')
  })

  test('displays hero in Arabic with RTL', async ({ page }) => {
    await page.goto('/ar')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('h1')).toContainText('ماذا تفعل')
  })

  test('displays hero in Somali', async ({ page }) => {
    await page.goto('/so')
    await expect(page.locator('h1')).toContainText('sidii samayn')
  })

  test('language switcher changes locale', async ({ page }) => {
    await page.goto('/fr')
    // Click the language switcher
    await page.getByRole('button', { name: /🇫🇷/ }).click()
    // Select English
    await page.getByRole('menuitem', { name: /English/ }).click()
    // Should be on English page
    await expect(page).toHaveURL(/\/en/)
    await expect(page.locator('h1')).toContainText('what to do')
  })
})
