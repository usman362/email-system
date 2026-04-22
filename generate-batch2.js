const XLSX = require('/Users/muhammadusman/Sites/email-system/node_modules/xlsx');

// Batch 1 emails to exclude
const batch1 = new Set([
  'klaus-robert.mueller@tu-berlin.de',
  'oliver.brock@tu-berlin.de',
  'manfred.opper@tu-berlin.de',
  'marc.alexa@tu-berlin.de',
  'volker.markl@tu-berlin.de',
  'odej.kao@tu-berlin.de',
  'anja.feldmann@tu-berlin.de',
  'thomas.wiegand@tu-berlin.de',
  'sebastian.moeller@tu-berlin.de',
  'jean-pierre.seifert@tu-berlin.de',
  'tim.landgraf@tu-berlin.de',
  'stefan.schmid@tu-berlin.de',
  'demir@tu-berlin.de',
  'wojciech.samek@tu-berlin.de',
  'gregoire.montavon@tu-berlin.de',
  'martin.skutella@tu-berlin.de',
  'joswig@math.tu-berlin.de',
  'hoemberg@math.tu-berlin.de',
  'mehrmann@math.tu-berlin.de',
  'moehring@math.tu-berlin.de',
  'sullivan@math.tu-berlin.de',
  'kutyniok@math.tu-berlin.de',
  'holger.stark@tu-berlin.de',
  'andreas.knorr@tu-berlin.de',
  'reich@physik.tu-berlin.de',
  'martin.kaupp@tu-berlin.de',
  'peter.hildebrandt@tu-berlin.de',
  'schomaecker@tu-berlin.de',
  'arne.thomas@tu-berlin.de',
  'dietmar.goehlich@tu-berlin.de',
  'utz.vonwagner@tu-berlin.de',
  'robert.liebich@tu-berlin.de',
  'julia.kowal@tu-berlin.de',
  'felix.ziegler@tu-berlin.de',
  'frank.behrendt@tu-berlin.de',
  'matthias.kraume@tu-berlin.de',
  'clemens.guehmann@tu-berlin.de',
  'sibylle.dieckerhoff@tu-berlin.de',
  'kai.strunz@tu-berlin.de',
  'caire@tu-berlin.de',
  'slawomir.stanczak@tu-berlin.de',
  'joerg.stollmann@tu-berlin.de',
  'regine.leibinger@tu-berlin.de',
  'donatella.fioretti@tu-berlin.de',
  'finn.geipel@tu-berlin.de',
  'mike.schlaich@tu-berlin.de',
  'frank.neitzel@tu-berlin.de',
  'knut.blind@tu-berlin.de',
  'jan.kratzer@tu-berlin.de',
  'christian.vonhirschhausen@tu-berlin.de',
  'georg.meran@tu-berlin.de',
  'dodo.knyphausen@tu-berlin.de',
  'benedicte.savoy@tu-berlin.de',
  'martina.loew@tu-berlin.de',
  'sabine.hark@tu-berlin.de',
  'birgit.beck@tu-berlin.de',
  'friedrich.steinle@tu-berlin.de',
  'edenhofer@tu-berlin.de',
  'vera.meyer@tu-berlin.de',
  'hans-liudger.dienel@tu-berlin.de'
]);

// Batch 2 — 60 new TU Berlin professors, diversified across faculties
const batch2 = [
  // Faculty I — Humanities, Education, Philosophy, History, Linguistics
  ['Stefanie Stadler Elmer', 'stefanie.elmer@tu-berlin.de'],
  ['Hans-Christian von Herrmann', 'hans-christian.vonherrmann@tu-berlin.de'],
  ['Norbert Bolz', 'norbert.bolz@tu-berlin.de'],
  ['Thorsten Roelcke', 'thorsten.roelcke@tu-berlin.de'],
  ['Monika Schwarz-Friesel', 'schwarz-friesel@tu-berlin.de'],
  ['Ulrike Hanke', 'ulrike.hanke@tu-berlin.de'],
  ['Nina Baur', 'nina.baur@tu-berlin.de'],
  ['Hubert Knoblauch', 'hubert.knoblauch@tu-berlin.de'],
  ['Gabriele Wendorf', 'gabriele.wendorf@tu-berlin.de'],
  ['Axel Gelfert', 'axel.gelfert@tu-berlin.de'],

  // Faculty II — Math, Physics, Chemistry
  ['Michael Lehmann', 'michael.lehmann@tu-berlin.de'],
  ['Stephan Reitzenstein', 'stephan.reitzenstein@physik.tu-berlin.de'],
  ['Michael Kneissl', 'michael.kneissl@tu-berlin.de'],
  ['Mario Daehne', 'mario.daehne@physik.tu-berlin.de'],
  ['Birgit Kanngiesser', 'birgit.kanngiesser@tu-berlin.de'],
  ['Michael Gradzielski', 'michael.gradzielski@tu-berlin.de'],
  ['Thomas Friedrich', 'thomas.friedrich@tu-berlin.de'],
  ['Maria Andrea Mroginski', 'maria.mroginski@tu-berlin.de'],
  ['Etienne Emmrich', 'emmrich@math.tu-berlin.de'],
  ['Dietmar Hoemberg', 'dietmar.hoemberg@wias-berlin.de'],

  // Faculty III — Process Sciences, Food Tech, Biotech, Environmental Eng
  ['Cornelia Rauh', 'cornelia.rauh@tu-berlin.de'],
  ['Sascha Rohn', 'rohn@tu-berlin.de'],
  ['Lars-Andre Tufvesson', 'lars.tufvesson@tu-berlin.de'],
  ['Peter Neubauer', 'peter.neubauer@tu-berlin.de'],
  ['Roland Lauster', 'roland.lauster@tu-berlin.de'],
  ['Juri Rappsilber', 'juri.rappsilber@tu-berlin.de'],
  ['Sven-Uwe Geissen', 'sven-uwe.geissen@tu-berlin.de'],
  ['Matthias Barjenbruch', 'matthias.barjenbruch@tu-berlin.de'],
  ['Manfred Gahr', 'manfred.gahr@tu-berlin.de'],
  ['Claudia Fleck', 'claudia.fleck@tu-berlin.de'],

  // Faculty IV — EECS (Software Eng, HCI, DB, Security, Networks)
  ['Axel Kuepper', 'axel.kuepper@tu-berlin.de'],
  ['Manfred Hauswirth', 'manfred.hauswirth@tu-berlin.de'],
  ['Benjamin Blankertz', 'benjamin.blankertz@tu-berlin.de'],
  ['Florian Tschorsch', 'florian.tschorsch@tu-berlin.de'],
  ['Reinhold Orglmeister', 'reinhold.orglmeister@tu-berlin.de'],
  ['Uwe Nestmann', 'uwe.nestmann@tu-berlin.de'],

  // Faculty V — Mech Eng & Transport (Aerospace, Rail, Fluid, Acoustics)
  ['Julien Weiss', 'julien.weiss@tu-berlin.de'],
  ['Andreas Bardenhagen', 'andreas.bardenhagen@tu-berlin.de'],
  ['Robert Luckner', 'robert.luckner@tu-berlin.de'],
  ['Dieter Peitsch', 'dieter.peitsch@tu-berlin.de'],
  ['Ennes Sarradj', 'ennes.sarradj@tu-berlin.de'],
  ['Paul Uwe Thamsen', 'paul-uwe.thamsen@tu-berlin.de'],
  ['Markus Hecht', 'markus.hecht@tu-berlin.de'],
  ['Kai Nagel', 'kai.nagel@tu-berlin.de'],
  ['Jana Sochor', 'jana.sochor@tu-berlin.de'],

  // Faculty VI — Planning, Building, Environment
  ['Angela Million', 'angela.million@tu-berlin.de'],
  ['Philipp Misselwitz', 'philipp.misselwitz@tu-berlin.de'],
  ['Undine Giseke', 'undine.giseke@tu-berlin.de'],
  ['Johann Koeppel', 'johann.koeppel@tu-berlin.de'],
  ['Oliver Schwedes', 'oliver.schwedes@tu-berlin.de'],
  ['Frank Eckardt', 'frank.eckardt@tu-berlin.de'],
  ['Matthias Ballestrem', 'matthias.ballestrem@tu-berlin.de'],

  // Faculty VII — Economics & Management
  ['Joachim R. Daduna', 'joachim.daduna@tu-berlin.de'],
  ['Hans Hirth', 'hans.hirth@tu-berlin.de'],
  ['Timm Teubner', 'timm.teubner@tu-berlin.de'],
  ['Stefan Seifert', 'stefan.seifert@tu-berlin.de'],
  ['Rudolf Schaefer', 'rudolf.schaefer@tu-berlin.de'],
  ['Frank Straube', 'frank.straube@tu-berlin.de'],
  ['Soeren Salomo', 'soeren.salomo@tu-berlin.de'],
  ['Jan Kratochvil', 'jan.kratochvil@tu-berlin.de']
];

// Dedup check against batch1
const overlaps = batch2.filter(([n, e]) => batch1.has(e.toLowerCase()));
console.log('Overlap with Batch 1:', overlaps.length);
if (overlaps.length > 0) {
  console.log('OVERLAPS:', overlaps);
}

// Also check internal dup
const emailSet = new Set();
const nameSet = new Set();
const dupEmail = [];
const dupName = [];
for (const [n, e] of batch2) {
  if (emailSet.has(e.toLowerCase())) dupEmail.push(e);
  if (nameSet.has(n)) dupName.push(n);
  emailSet.add(e.toLowerCase());
  nameSet.add(n);
}
console.log('Internal dup emails:', dupEmail);
console.log('Internal dup names:', dupName);
console.log('Total rows:', batch2.length);

// Build worksheet
const header = [['Name', 'Email']];
const rows = header.concat(batch2);
const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Batch2');
XLSX.writeFile(wb, '/Users/muhammadusman/Sites/email-system/tu-berlin-batch-2.xlsx');
console.log('File written');
