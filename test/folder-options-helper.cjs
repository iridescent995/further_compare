'use strict';
async function openFolderOptions(page){await page.locator('#folderOptions').click();}
async function selectFolderOption(page,id,value){await openFolderOptions(page);await page.locator('#'+id).selectOption(value);await page.locator('#folderOptionsDialog [data-done]').click();}
async function clickFolderOption(page,id){await openFolderOptions(page);await page.locator('#'+id).click();}
async function fillFolderOption(page,id,value){await openFolderOptions(page);await page.locator('#'+id).fill(value);await page.locator('#'+id).press('Tab');await page.locator('#folderOptionsDialog [data-done]').click();}
module.exports={openFolderOptions,selectFolderOption,clickFolderOption,fillFolderOption};
