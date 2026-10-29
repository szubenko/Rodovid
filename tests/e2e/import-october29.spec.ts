import { expect, test } from '@playwright/test'
import type { FamilyData } from '../../src/data/schema'

test('merged Ustina has one room with all three children and her father',async({page})=>{
  const family=await(await page.request.get('/data/family.json')).json() as FamilyData
  expect(family.people.filter(p=>p.externalIds.some(id=>id.value==='PNPT-HVQ')).map(p=>p.id)).toEqual(['I93'])
  await page.goto('/person/I93')
  await expect(page.getByRole('heading',{name:'Устина Андріївна',exact:true})).toBeVisible()
  const relatives=page.getByRole('region',{name:'Переходи до рідних',exact:true})
  for(const name of ['Феодор Зубенко','Петр Петров Зубенко','Яковь Петров Зубенко','Андрій'])await expect(relatives.getByRole('button',{name,exact:true})).toBeVisible()
  await relatives.getByRole('button',{name:'Андрій',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Андрій',exact:true})).toBeVisible()
})

test('the new birth indices share the original act and all three URLs',async({page},info)=>{
  await page.setViewportSize({width:info.project.name.includes('mobile')?320:1280,height:900})
  await page.goto('/person/I8')
  const source=page.locator('[data-source-for="event-24de72684a0d23588ed45900"]')
  await source.locator('summary').click()
  await expect(source.locator('img')).toHaveCount(1)
  await expect(source.locator('blockquote')).toHaveCount(1)
  for(const ark of ['6X32-8MMR','6X32-8MMT','6X32-8MM1'])await expect(source.locator(`a[href$="${ark}"]`)).toHaveCount(1)
  expect(await page.locator('html').evaluate(e=>e.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await source.screenshot({path:info.outputPath('petro-three-new-indices.png')})
})
