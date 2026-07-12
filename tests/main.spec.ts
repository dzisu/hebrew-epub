import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";

// TODO: not working with test consistently
// test("test with plain word file", async ({ page }) => {
//   await page.goto("http://localhost:3000/");
//   await expect(page).toHaveTitle(/RTL EPUB Maker/);
//   await expect(page.getByText("Easily create EPUB e-book")).toBeVisible();
//   // inserts the text from a word file
//   const fileChooserPromise = page.waitForEvent("filechooser");
//   await page.getByText("Drag file or click to add").click();
//   const fileChooser = await fileChooserPromise;
//   const wordFile = path.join("tests", "test-content", "test.docx");
//   await fileChooser.setFiles(wordFile);
//   const textbox = page.getByLabel("Text in Markdown");
//   expect(textbox).toHaveValue("Text from Word file\n");
//   // add title - author etc
//   await page.getByRole("textbox", { name: "title" }).click();
//   await page.getByRole("textbox", { name: "title" }).fill("My Title");
//   await page.getByRole("textbox", { name: "X author" }).click();
//   await page.getByRole("textbox", { name: "X author" }).fill("My Author");
//   await page.getByRole("button", { name: "cover image (.jpg or .png" }).click();
//   // add cover image
//   const f2 = await fileChooserPromise;
//   f2.setFiles(path.join("tests", "test-content", "vancouver.jpg"));
//   const downloadPromise = page.waitForEvent("download");
//   await page.getByRole("button", { name: "Download .epub" }).click();
//   await downloadPromise;
// });

// for some reason the testing of the text area gets confused when we update it
// multiple times so I will split these into seperate tests
test("test with plain text file", async ({ page }) => {
  await page.goto(baseUrl);
  await expect(page).toHaveTitle(/Hebrew EPUB/);
  await expect(page.getByText("המרת מסמכים לספר EPUB")).toBeVisible();
  const fileChooserPromise = page.waitForEvent("filechooser");
  // inserts the text from a plain text file
  await page.getByText("גרור קובץ לכאן").click();
  const fileChooser = await fileChooserPromise;
  const mdFile = path.join("tests", "test-content", "test.md");
  await fileChooser.setFiles(mdFile);
  const textbox = page.getByLabel("או הדבק טקסט להמרה");
  expect(textbox).toHaveValue(fs.readFileSync(mdFile, "utf8"));
  // add title - author etc
  await page.getByRole("textbox", { name: "כותרת הספר" }).click();
  await page.getByRole("textbox", { name: "כותרת הספר" }).fill("My Title");
  await page.getByRole("textbox", { name: "X מחבר" }).click();
  await page.getByRole("textbox", { name: "X מחבר" }).fill("My Author");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "צור EPUB" }).click();
  await downloadPromise;
});
