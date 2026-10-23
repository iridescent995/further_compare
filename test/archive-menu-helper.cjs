'use strict';
const {expect}=require('@playwright/test');
// Traverse the actual grouped menu; leaf labels remain the behavioral contract.
async function archiveMenuItem(page,label){
 const root=page.locator('#archiveContext');await expect(root).toBeVisible();
 const leaf=root.getByRole('menuitem',{name:label,exact:true});
 if(await leaf.count())return leaf;
 const groups=root.locator('.folder-context-panel').first().locator('button[aria-haspopup="menu"]');
 for(const group of await groups.all()){
  await page.mouse.move(0,0);await group.focus();await group.press('ArrowRight');
  if(await leaf.count())return leaf;
 }
 throw Error('Archive context action was not found: '+label);
}
module.exports={archiveMenuItem};
