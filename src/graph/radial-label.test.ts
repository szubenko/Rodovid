import { describe, expect, it } from 'vitest'
import { nameLines, radialLabel } from './radial-label'

const center = { x: 500, y: 500 }
const measure = (text: string, size: number) => Array.from(text).length * size * 0.5
const sector = { startAngle: -108, endAngle: -81, innerRadius: 360, outerRadius: 500, labelRadius: 430, reverseLabel: false }

describe('radial labels from the fourth generation', () => {
  it('keeps the full given name and surname on at most two balanced lines', () => {
    expect(nameLines('Макар Ільянов Зубенко', 120, (text) => measure(text, 18))).toEqual(['Макар Ільянов', 'Зубенко'])
    expect(nameLines('Наталия Семенова Пластун', 150, (text) => measure(text, 18))).toEqual(['Наталия Семенова', 'Пластун'])
  })
  it('wraps a full ancestor name and dates into upright lines inside the sector', () => {
    const block = radialLabel(sector, center, 'Макар Ільянов Зубенко', 'нар. 1900', 18, 14, measure)
    expect(block.rotation).toBe(-4.5)
    expect(block.lines.filter((line) => !line.date)).toHaveLength(2)
    expect(block.lines.filter((line) => !line.date).map((line) => line.text).join(' ')).toBe('Макар Ільянов Зубенко')
    expect(block.lines.some((line) => line.text === 'нар. 1900')).toBe(true)
    for (const line of block.lines) expect(measure(line.text, line.date ? 14 : 18)).toBeLessThanOrEqual(block.width)
  })

  it('keeps every text box inside the ring and angular boundaries on both sides', () => {
    for (let startAngle = -108; startAngle < 108; startAngle += 27) {
      const block = radialLabel({ ...sector, startAngle, endAngle: startAngle + 27 }, center, 'Довге ім’я з кількох слів', 'нар. 1900', 18, 14, measure)
      expect(Math.abs(block.rotation)).toBeLessThanOrEqual(90)
      const theta = block.rotation * Math.PI / 180
      for (const x of [-block.width / 2, block.width / 2]) for (const y of [-block.height / 2, block.height / 2]) {
        const dx = block.x + x * Math.cos(theta) - y * Math.sin(theta) - center.x
        const dy = block.y + x * Math.sin(theta) + y * Math.cos(theta) - center.y
        const radius = Math.hypot(dx, dy)
        const angle = Math.atan2(dx, -dy) * 180 / Math.PI
        expect(radius).toBeGreaterThan(sector.innerRadius)
        expect(radius).toBeLessThan(sector.outerRadius)
        expect(angle).toBeGreaterThan(startAngle)
        expect(angle).toBeLessThan(startAngle + 27)
      }
    }
  })

  it('does not overflow or shrink text when there is no room', () => {
    const block = radialLabel({ ...sector, endAngle: -107, outerRadius: 380 }, center, 'Довге ім’я', 'Дати не вказані', 18, 14, measure)
    expect(block.lines).toEqual([])
    expect(Number.isFinite(block.x)).toBe(true)
  })
})
