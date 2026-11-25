export interface InspectionItem {
  label: string;
  status: string;
  comment: string;
}

// Inspection config per machine category.
// NOTE: For Plastextrudrar, "Motor" uses dedicated motor_status/motor_comment
// columns to avoid colliding with the "Uppmätt massa" section which uses
// material_status/material_measured_mass.
export const inspectionConfig: Record<string, InspectionItem[]> = {
  Handmaskiner: [
    { label: "Värmelement", status: "heating_element_status", comment: "heating_element_comment" },
    { label: "Elkablage / Kontakt", status: "cable_contact_status", comment: "cable_contact_comment" },
    { label: "Luftintag / Filter", status: "air_intake_filter_status", comment: "air_intake_filter_comment" },
    { label: "Kol", status: "brass_nozzle_status", comment: "brass_nozzle_comment" },
    { label: "Motor", status: "screw_extruder_status", comment: "screw_extruder_comment" },
  ],
  Automatsvetsar: [
    { label: "Värmelement", status: "heating_element_status", comment: "heating_element_comment" },
    { label: "Elkablage / Kontakt", status: "cable_contact_status", comment: "cable_contact_comment" },
    { label: "Luftintag / Filter", status: "air_intake_filter_status", comment: "air_intake_filter_comment" },
    { label: "Kol", status: "brass_nozzle_status", comment: "brass_nozzle_comment" },
    { label: "Drivning", status: "screw_extruder_status", comment: "screw_extruder_comment" },
    { label: "Motor", status: "right_left_feed_status", comment: "right_left_feed_comment" },
  ],
  Plastextrudrar: [
    { label: "Värmelement", status: "heating_element_status", comment: "heating_element_comment" },
    { label: "Elkablage / Kontakt", status: "cable_contact_status", comment: "cable_contact_comment" },
    { label: "Luftintag / Filter", status: "air_intake_filter_status", comment: "air_intake_filter_comment" },
    { label: "Skruv / Extruder (Matning)", status: "screw_extruder_status", comment: "screw_extruder_comment" },
    { label: "Höger / Vänster Matning", status: "right_left_feed_status", comment: "right_left_feed_comment" },
    { label: "Mässingsmunstycke", status: "brass_nozzle_status", comment: "brass_nozzle_comment" },
    { label: "Motor", status: "motor_status", comment: "motor_comment" },
  ],
  Luftvärmare: [
    { label: "Värmelement", status: "heating_element_status", comment: "heating_element_comment" },
    { label: "Elkablage / Kontakt", status: "cable_contact_status", comment: "cable_contact_comment" },
    { label: "Luftintag / Filter", status: "air_intake_filter_status", comment: "air_intake_filter_comment" },
    { label: "Motor", status: "screw_extruder_status", comment: "screw_extruder_comment" },
  ],
};

export interface CalibrationItem {
  label: string;
  field: "hotAir" | "plasticMass";
  refValue: number;
  unit: string;
}

export const calibrationConfig: Record<string, CalibrationItem[]> = {
  Handmaskiner: [
    { label: "Varmluft (600 °C)", field: "hotAir", refValue: 600, unit: "°C" },
  ],
  Automatsvetsar: [
    { label: "Varmluft (600 °C)", field: "hotAir", refValue: 600, unit: "°C" },
    { label: "Drivning (3 m/min)", field: "plasticMass", refValue: 3, unit: "m/min" },
  ],
  Luftvärmare: [
    { label: "Varmluft (600 °C)", field: "hotAir", refValue: 600, unit: "°C" },
  ],
};

export function getExtruderCalibration(plasticType: string): CalibrationItem[] {
  const plasticTemp = plasticType === "PP" ? 240 : 230;
  return [
    { label: "Varmluft (260 °C)", field: "hotAir", refValue: 260, unit: "°C" },
    { label: `Plastmassa (${plasticTemp} °C)`, field: "plasticMass", refValue: plasticTemp, unit: "°C" },
  ];
}

export function getCalibrationConfig(machineCategory: string, plasticType: string): CalibrationItem[] {
  if (machineCategory === "Plastextrudrar") return getExtruderCalibration(plasticType);
  return calibrationConfig[machineCategory] || [];
}

