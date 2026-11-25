export const machineCategories = {
  Handmaskiner: [
    "Triac ST", "Triac AT", "Hotjet S", "Ghibli F", "Ghibli AW",
    "Solano AT", "Diode S", "Diode PID", "Penweld", "Electron", "Electron 400V"
  ],
  Automatsvetsar: [
    "Varimat V2", "Varimat 300", "Varimat 500", "Varimat 700",
    "Uniroof AT", "Uniroof ST", "Uniroof 300", "Uniroof 700", "Uniroof E",
    "Uniplan E", "Uniplan S",
    "Twinny S", "Twinny T", "Comet", "Twinny T7", "Comet 700", "Hemtek ST"
  ],
  Plastextrudrar: [
    "Weldplast S1", "Weldplast S2", "Weldplast S4", "Weldplast S6",
    "Fusion 1", "Fusion 2", "Fusion 3", "Fusion 3C"
  ],
  Luftvärmare: [
    "LHS 15 Classic", "LHS 15 System", "LHS 15 Premium",
    "LHS 21 Classic", "LHS 21 System", "LHS 21 Premium",
    "LHS 41 Classic", "LHS 41 System", "LHS 41 Premium",
    "LHS 61 Classic", "LHS 61 System", "LHS 61 Premium",
    "Mistral Premium", "Mistral System",
    "Hotwind Premium", "Hotwind System",
    "Vulcan System"
  ],
} as const;

export type MachineCategory = keyof typeof machineCategories;

export const serviceIntervalMonths: Record<MachineCategory, number> = {
  Handmaskiner: 0,
  Automatsvetsar: 12,
  Plastextrudrar: 12,
  Luftvärmare: 12,
};


export const TECHNICIANS = ["Martin Öberg", "Mattias Piltorp", "Peter Piltorp"];
