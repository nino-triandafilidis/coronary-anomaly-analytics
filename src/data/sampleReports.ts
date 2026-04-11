// Real de-identified coronary CTA reports from Stanford Children's Hospital cardiology.
// Source: real_cta/CTA_1.pdf, CTA_2.pdf, CTA_3.pdf

export const sampleReports = [
  {
    id: "cta-1",
    title: "Sample A — Anomalous RCA from Left Cusp, Interarterial Course",
    text: `CTA CORONARY ARTERIES: 8/8/2025 3:22 PM

COMPARISON: Cardiac MRI 8/7/2025.

PROCEDURE COMMENTS:

Premedication: None.

Intravenous Beta-blocker: None.

Nitroglycerine: None.

Image Acquisition by Series:

1. Coronary Angiogram

Dose information: Based on a 32 cm phantom, the estimated radiation dose (CTDIvol [mGy]) for each series in this exam is 0.01,0.32,0.32,4.81,19.5 mGy. The estimated cumulative dose (DLP [mGy-cm]) is 0.54,0.16,0.16,2.40,505. Estimated cumulative dose or total dose-length-product (DLP) is: 508 mGy-cm.

Intravenous Contrast Medium: Isovue 370. The amount administered to the patient is documented in the electronic medical record.

Cardiac Gating: Coronary Angiogram was performed using ECG-based tube current modulation with retrospective cardiac gating.

Image Reconstruction: Axial images of the Coronary Angiogram acquisition were reconstructed at thin (approximately 0.5-1 mm) slice thicknesses at the targeted R-R interval. Lower resolution axial images were also reconstructed of the entire R-R interval (0-90%).

3D reformations consisting of curved and multiplanar reformations, maximum intensity projections, and volume rendered images were performed on an independent workstation and corroborate the findings made in the report of the source images.

FINDINGS:

Prior Surgery/Intervention: None.

CORONARY ARTERIES:

Left Main: Arises from its expected left coronary sinus. Slightly high origin near the sinotubular junction. Patent without significant narrowing.

Left Anterior Descending: Patent without significant narrowing. Superficial partial bridging of the mid LAD. No complete myocardial bridge.

Left Circumflex: Patent without significant narrowing.

Right: Anomalous origin from the left coronary cusp, separate from the left main origin, slightly high near the sinotubular junction, with an interarterial course for approximately ~1 cm. Slightly acute takeoff angle but no significant narrowing of the interarterial segment. Otherwise, RCA is patent without significant narrowing. Right dominant coronary arterial system.

EXTRACORONARY CARDIOVASCULAR

Heart: Normal in size. Normal in architecture.

Pericardium: No pericardial effusion.

Visualized Aorta: No significant abnormality.

Pulmonary Arteries: Not enlarged. No obvious central filling defects on this non-dedicated study to suggest pulmonary embolism.

OTHER

Medical Devices: None.

Mediastinal/Hilar Lymph Nodes: No pathologically enlarged lymph nodes.

Other Mediastinal Structures: No significant abnormality.

Lung Parenchyma: Minimal subsegmental atelectasis at the left lung base.

Airways: Central airways are patent. Mild bronchial wall thickening.

Pleura: No pleural effusions.

Chest Wall: Mild prominence of bilateral breast tissue.

Visualized Abdomen: No significant abnormality on this limited, non-dedicated study.

Bones: No aggressive osseous lesions.

IMPRESSION:

* Anomalous right coronary artery origin from the left coronary cusp, separate from the left main takeoff, with an interarterial course. RCA origin is slightly high near the sinotubular junction. Takeoff angle is slightly acute, but no significant narrowing of the interarterial segment. Right coronary artery dominance.

* Patent left coronary system without stenosis. Superficial partial bridging of the mid LAD, but no complete (grade III) myocardial bridge.

* Structurally normal heart.`,
  },
  {
    id: "cta-2",
    title: "Sample B — Anomalous RCA, Intramural Course with Proximal Stenosis",
    text: `CTA CORONARY ARTERIES: 10/31/2024 11:20 AM

COMPARISON: None.

PROCEDURE COMMENTS:

Premedication: None

Intravenous Beta-blocker: 5 mg metoprolol administered

Nitroglycerine: None

Image Acquisition by Series (and Radiation Doses in CTDIvol):

1. Coronary Angiogram (mGy)

Estimated radiation doses are based on a 32 cm body phantom reference.

Estimated cumulative dose or total dose-length-product (DLP) is: Not available at time of dictation.

Intravenous Contrast Medium Administered: mL of Isovue 370

Cardiac Gating: Coronary Angiogram was performed using FLASH protocol and ECG-based tube current modulation targeting diastole with retrospective cardiac gating.

Image Reconstruction: Axial images of the Coronary Angiogram acquisition were reconstructed at thin (approximately 0.5-1 mm) slice thicknesses at the targeted R-R interval (70%). Lower resolution axial images were also reconstructed of the entire R-R interval (0-90%).

3D reformations consisting of curved and multiplanar reformations, maximum intensity projections, and volume rendered images were performed on an independent workstation and corroborate the findings made in the report of the source images.

FINDINGS:

Prior Surgery/Intervention: None.

CORONARY ARTERIES:

Left Main: Arises from its expected location off the left coronary sinus. Patent without significant narrowing. Circulation is left dominant.

Left Anterior Descending: Patent without significant narrowing.

Left Circumflex: Patent without significant narrowing.

Right: Abnormal origin from the left coronary cusp, likely from separate origin just adjacent to the left main origin. The proximal right coronary artery appears significantly narrowed with a relatively long interarterial course. There is limited opacification of the distal right coronary artery, likely flow-related in setting of proximal stenosis.

EXTRACORONARY CARDIOVASCULAR

Heart: Normal in size. Normal in architecture. There is mild right ventricular hypertrophy.

Pericardium: No pericardial effusion.

Visualized Aorta: No significant abnormality.

Pulmonary Arteries: Not enlarged. No obvious central filling defects on this non-dedicated study to suggest pulmonary embolism.

OTHER

Medical Devices: None.

Mediastinal/Hilar Lymph Nodes: No pathologically enlarged lymph nodes.

Other Mediastinal Structures: No significant abnormality.

Lung Parenchyma: Lungs are clear.

Airways: Central airways are clear.

Pleura: No pleural effusions.

Chest Wall: No significant abnormality.

Visualized Abdomen: No significant abnormality on this limited, non-dedicated study.

Bones: No aggressive osseous lesions.

IMPRESSION:

1. Anomalous origin of the right coronary artery from the left coronary cusp with an interarterial and likely intramural course given significant narrowing along the proximal RCA. Slow filling of distal RCA.

2. Left dominant coronary circulation.

3. Mild right ventricular hypertrophy.`,
  },
  {
    id: "cta-3",
    title: "Sample C — Anomalous RCA from Left Sinus of Valsalva, Intramural Course",
    text: `CTA CORONARY ARTERIES: 7/31/2025 11:58 AM

COMPARISON: Report of cardiac ultrasound 7/1/2025.

PROCEDURE COMMENTS:

Premedication: None.

Intravenous Beta-blocker: None.

Nitroglycerine: None.

Image Acquisition by Series:

1. Coronary Angiogram

Dose information: Based on a 32 cm phantom, the estimated radiation dose (CTDIvol [mGy]) for each series in this exam is 0.01,0.38,3.11,31.3 mGy. The estimated cumulative dose (DLP [mGy-cm]) is 0.48,0.19,1.55,655. Estimated cumulative dose or total dose-length-product (DLP) is: 657 mGy-cm.

Intravenous Contrast Medium: Isovue 370. The amount administered to the patient is documented in the electronic medical record.

Cardiac Gating: Coronary Angiogram was performed using ECG-based tube current modulation with retrospective cardiac gating.

Image Reconstruction: Axial images of the Coronary Angiogram acquisition were reconstructed at thin (approximately 0.5-1 mm) slice thicknesses at the targeted R-R interval (70%). Lower resolution axial images were also reconstructed of the entire R-R interval (0-90%).

3D reformations consisting of curved and multiplanar reformations, maximum intensity projections, and volume rendered images were performed on an independent workstation and corroborate the findings made in the report of the source images.

FINDINGS:

Prior Surgery/Intervention: None.

SEGMENTAL ANALYSIS:

Situs: Situs solitus by normal spleen in the left upper quadrant and normal pulmonary arteries and airways relationships.

Cavae: Single right-sided SVC and single right-sided IVC drain to the right atrium unobstructed.

Pulmonary Veins: Two right-sided pulmonary veins and two left-sided pulmonary veins drain to the left atrium. No evidence of compression, stenosis, or anomalous pulmonary venous return.

Atria: Grossly normal size. No gross interatrial communication.

Atrioventricular Connection: Concordant. Two distinct atrioventricular valves. Endocardial cushion present.

Ventricles: D-loop with apex pointing to the left. Both ventricles are qualitatively normal in size, morphology, and function. No gross interventricular communication.

Ventriculoarterial Connection: Concordant. Main pulmonary artery courses anterior and to the left of the ascending aorta, consistent with normal position of the great arteries.

Coronary Arteries:

* Left Main: Arises from its expected location off the left coronary sinus. Patent without significant narrowing. Normal bifurcation into the LAD and LCx.

* Left Anterior Descending: Patent without significant narrowing. Wraps around the apex to supply the apical posterior wall. Minimal superficial bridging of the mid/distal LAD. No complete myocardial bridge.

* Left Circumflex: Patent without significant narrowing. Supplies the posterolateral branch, compatible with codominant circulation.

* Right: Arises from the left sinus of Valsalva with intramural, interarterial course, noting acute takeoff angle. The intramural course measures approximately 20 mm. The takeoff from the left sinus of Valsalva is sharply angulated to the right. The intramural component is narrowed measuring approximately 1 x 4 mm in cross-section.

Aorta: Left-sided aortic arch. No evidence of aneurysm, coarctation or major aorto-pulmonary collateral arteries.

Pulmonary Arteries: Central pulmonary arteries are patent. No evidence of dilatation or stenosis. No pulmonary embolism is identified.

OTHER:

Medical Devices: None.

Mediastinal/Hilar Lymph Nodes: No pathologically enlarged lymph nodes.

Other Mediastinal Structures: No significant abnormality.

Lung Parenchyma: Lungs are clear.

Airways: Central airways are patent. Mild bronchial wall thickening.

Pleura: No pleural effusions.

Chest Wall: Gynecomastia.

Visualized Abdomen: No significant abnormality on this limited, non-dedicated study.

Bones: No aggressive osseous lesions.

IMPRESSION:

1. Anomalous origin of the right coronary artery from the left sinus of Valsalva with intramural, interarterial course. The intramural course measures approximately 20 mm, with narrowing of the intramural component measuring approximately 1 x 4 mm in cross-section. Co-dominant coronary circulation.

2. The left coronary artery arises from the facing left sinus of Valsalva and is widely patent throughout its course.

3. Otherwise, structurally normal heart.`,
  },
];
