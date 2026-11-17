const assert = require('assert');
const { runCalendarUpdate, scrapeLocoZaragoza } = require('./scraperEngine');

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 PRUEBAS SALA [LOCO ZARAGOZA] (https://www.locozaragozadiscoteca.com/) Y ANTI-DUPLICADOS');
  console.log('===============================================================\n');

  // Prueba 1: Extracción directa de https://www.locozaragozadiscoteca.com/
  console.log('▶ PRUEBA 1: Extracción directa de https://www.locozaragozadiscoteca.com/');
  const loco = await scrapeLocoZaragoza('https://www.locozaragozadiscoteca.com/', 'Zaragoza', new Date('2026-11-16T12:00:00Z'));
  console.log(`   - Conciertos extraídos de locozaragozadiscoteca.com: ${loco.count}`);
  assert(loco.ok && loco.count >= 15, 'Debe extraer toda la cartelera de conciertos de 2026 y 2027 de Loco Zaragoza');

  for (const ev of loco.events.slice(0, 6)) {
    console.log(`     • ${ev.date} | [${ev.venueTag}] ${ev.artistName} ${ev.musicStyle ? '(' + ev.musicStyle + ')' : ''} -> ${ev.sourceName} (${ev.url})`);
    assert.strictEqual(ev.venueTag, 'LOCO ZARAGOZA', 'El TAG debe ser LOCO ZARAGOZA');
  }

  // Prueba 2: Verificar que GBH + Kbks (2026-11-20), que aparece tanto en locozaragozadiscoteca.com como en aragonenvivo.com, NO SE DUPLICA
  console.log('\n▶ PRUEBA 2: Verificación de NO duplicación cuando un concierto viene por varias vías');
  const res = await runCalendarUpdate({
    cityConfig: {
      name: 'Zaragoza',
      urls: [
        'https://aragonenvivo.com/',
        'https://www.locozaragozadiscoteca.com/',
        'https://salalopez.com/eventos/',
        'https://www.rockandbluescafe.com/conciertos/'
      ]
    },
    preferences: {
      A: {
        showTypes: ['Conciertos', 'Teatro', 'Cine', 'Exposiciones']
      }
    }
  });

  const gbhEvents = res.events.filter(e => e.title.toLowerCase().includes('gbh'));
  console.log(`   - Apariciones de "GBH + Kbks" en el calendario final: ${gbhEvents.length}`);
  assert.strictEqual(gbhEvents.length, 1, 'GBH + Kbks NO debe duplicarse aunque venga en locozaragoza y aragonenvivo');
  console.log(`   - URL conservada para GBH + Kbks (prioridad web directa de la sala): ${gbhEvents[0].url}`);

  const locoVenueInCatalog = res.concertVenues.find(v => v.tag === 'LOCO ZARAGOZA');
  assert(locoVenueInCatalog, 'Debe existir [LOCO ZARAGOZA] en el catálogo de salas');
  console.log(`   - Total conciertos únicos en [LOCO ZARAGOZA]: ${locoVenueInCatalog.count}`);

  console.log('\n🎉 TODAS LAS PRUEBAS DE [LOCO ZARAGOZA] Y ANTI-DUPLICACIÓN SUPERADAS.');
}

runTests().catch(err => {
  console.error('❌ FALLO EN LAS PRUEBAS:', err);
  process.exit(1);
});
