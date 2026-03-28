// Real de-identified MIMIC-IV radiology reports.
// Selected for high anomaly density and cardiac/pulmonary relevance.
// Source: public/mimic_reports_300.json (indices 235, 130, 256)

export const sampleReports = [
  {
    id: "mimic-235",
    title: "CTA Chest — Extensive PE with Pulmonary Nodules",
    text: `EXAMINATION:  CTA chest

INDICATION:  History: ___ status post robotic radical cystectomy on ___
with post op LLE DVT has been on lovenox, now presenting with new oxygen
requirement and worsening dyspnea on exertion x 1 day  // eval for pulmonary
embolism

TECHNIQUE:  Axial multidetector CT images were obtained through the thorax
after the uneventful administration of intravenous contrast.
Reformatted coronal, sagittal, thin slice axial images, and oblique maximal
intensity projection images were submitted to PACS and reviewed.

DOSE:  Acquisition sequence:
   1) Stationary Acquisition 1.5 s, 0.5 cm; CTDIvol = 4.6 mGy (Body) DLP = 2.3
mGy-cm.
   2) Spiral Acquisition 3.8 s, 29.6 cm; CTDIvol = 9.5 mGy (Body) DLP = 280.3
mGy-cm.
 Total DLP (Body) = 283 mGy-cm.

COMPARISON:  CT chest ___, PET-CT ___

FINDINGS:

The aorta and its major branch vessels are patent, with no evidence of
stenosis, occlusion, dissection, or aneurysmal formation.  There is no
evidence of penetrating atherosclerotic ulcer or aortic arch atheroma present.
Moderate atherosclerotic calcifications are noted throughout the thoracic
aorta.

There is extensive thrombus seen extending from the right main pulmonary
artery into the right upper, middle, and lower lobes.  Additionally, there are
smaller thrombi seen in the segmental branches of the left upper and lower
lobes.  The main and right pulmonary arteries, however, are normal in caliber,
and there is no evidence of right heart strain.

There is no supraclavicular, axillary, mediastinal, or hilar lymphadenopathy.
Rim calcified 9 mm thyroid nodule is unchanged (3:2).  Aortic and mitral
valvular calicifications R presents.  Heart size is normal.

There is no evidence of pericardial effusion.  There is no pleural effusion.

Several pulmonary nodules are noted, as seen previously, with the largest
measuring up to 1 cm in the right middle lobe (series 2: Image 59), all of
which appear unchanged from prior exam.  The airways are patent to the
subsegmental level.

Limited images of the upper abdomen are remarkable for a a 1.1 cm hypodense
structure in the liver dome, likely day hepatic cyst.  There is a small hiatal
hernia.

No lytic or blastic osseous lesion suspicious for malignancy is identified.
Degenerative changes are noted in the thoracic spine.  2 soft tissue nodules
are identified within the left breast measuring 11 and 7 mm, similar to the
previous CT.

IMPRESSION:

1.  Extensive pulmonary embolism with thrombus seen extending from the right
main pulmonary artery into the segmental and subsegmental right upper, middle,
and lower lobe pulmonary arteries.  No right heart strain identified.
2.  Additionally, there are smaller pulmonary emboli seen in the segmental and
subsegmental branches of the left upper and lower lobes.
3.  Several pulmonary nodules are noted, as noted previously, with the largest
appearing spiculated and measuring up to 1 cm in the right middle lobe,
suspicious for malignancy on the previous PET-CT.
4.  Re- demonstration of 2 left breast nodules for which correlation with
mammography and ultrasound is suggested.

RECOMMENDATION(S):  Left breast ultrasound and mammography for the 2 breasts
nodules, as previously recommended.

NOTIFICATION:  The findings were discussed with ___, M.D. by ___
___, M.D. on the telephone on ___ at 7:55 ___, 2 minutes after discovery
of the findings.`,
  },
  {
    id: "mimic-130",
    title: "CT Chest — CAD, Pulmonary Edema, Mitral Regurgitation",
    text: `INDICATION:  History of coronary artery disease, hypertension, hyperlipidemia
who presents with shortness of breath, echo with severe mitral regurgitation,
preoperative exam, question opacity in the right upper lobe.

COMPARISONS:  Chest radiograph from ___.

TECHNIQUE:  MDCT axial imaging was obtained through the chest without the
administration of intravenous contrast material.  Coronal and sagittal
reformats were completed.

FINDINGS:  The thyroid gland is unremarkable.  There are no enlarged
supraclavicular or axillary lymph nodes.  There are prominent mediastinal
nodes, for example, 9 mm node (2:16), subcarinal node measures 8 mm in short
axis.  There are dense coronary artery calcifications as well as mild aortic
valvular calcifications.  There is no pericardial effusion.  The aorta is of
normal caliber.  Pulmonary artery is enlarged, specifically the right main
branch measures 2.5 cm.  The airways are patent to the subsegmental levels.

Large areas of confluent, relatively central ground-glass opacity, involve
contiguous, central right upper lobe and lower lobes.  There are no nodules or
masses.  Left upper lobe subpleural opacity (4:46) is noted.  No pleural
effusion or pneumothorax.  There is no large focal consolidation.  There are
areas of scarring and paraseptal emphysema in the right middle lobe and
lingula.

This study is not tailored for evaluation of subdiaphragmatic structures, but
limited views demonstrate atherosclerotic disease at the origins of the celiac
artery and SMA.

There are no concerning bony lesions.

IMPRESSION:

1.  Diffuse confluent ground-glass opacities predominantly in the right upper
lobe and right lower lobe most likely represent residual pulmonary edema,
localized to the right lung because of direction of jet in mitral
regurgitation.

2.  Possible pulmonary hypertension.

3.  Moderate coronary artery disease.`,
  },
  {
    id: "mimic-256",
    title: "CT Chest — Pulmonary Nodules, Coronary Calcification",
    text: `EXAMINATION:  CT CHEST W/CONTRAST

INDICATION:  ___ year old woman with bladder ca, schedule for radical
cystectomy  // please evaluate for any abnormalities, mets

TECHNIQUE:  Non contrasted CT chest

DOSE:  Acquisition sequence:
   1) Spiral Acquisition 6.8 s, 35.9 cm; CTDIvol = 7.6 mGy (Body) DLP = 276.7
mGy-cm.
 Total DLP (Body) = 277 mGy-cm.

COMPARISON:  No prior chest CT available for comparison.

FINDINGS:

FINDINGS:

NECK, THORACIC INLET, AXILLAE, CHEST WALL: Circumferentially calcified nodule
in the right lobe of the thyroid measuring 8 mm in diameter.  Smaller punctate
calcifications just anterior to the right lobe of thyroid (6, 22).  No
supraclavicular adenopathy.  No axillary adenopathy.  There is attenuation of
the left subclavian vein as it crosses between the clavicle and the first rib
with mildly prominent collateral vessels, with his most likely is secondary to
the patient's ___ position.  2 subcentimeter soft tissue nodules in the left
breast (6, 164 and 140).

UPPER ABDOMEN: This study was not tailored to evaluate the subdiaphragmatic
organs.  Small sliding hiatus hernia.  No adrenal lesions.  Hypodense lesion
in segment 7 of the liver appear similar compared to prior imaging done ___.  Evidence of previous cholecystectomy.  Mild stranding seen adjacent to
the right kidney/ ___ pouch.

MEDIASTINUM: No mediastinal adenopathy.

HILA: Subcentimeter hilar lymph nodes.

HEART and PERICARDIUM: Normal cardiac configuration.  Moderate aortic annular
calcifications.  Mild coronary artery calcifications.  No pericardial
effusion.  Moderate calcification of the aortic arch and supra-aortic vessels.
PLEURA: No pleural effusion.
LUNG:

-PARENCHYMA:  Biapical pleural-parenchymal scarring.  There are 2 spiculated
irregular part solid nodules with associated bronchiolectasis the largest in
the right upper lobe (6, 146) with the nodule and solid component measuring
10.5 mm (the sub solid component is seen in its inferior aspect).  Smaller
irregular bubbly part solid nodule measuring 7 mm in average diameter in the
left lower lobe (6, 186).  Few small pulmonary nodules measuring 3 mm in
diameter seen in the left lower lobe (6, 181) and (6, 118) which are
indeterminate.  Mild centrilobular emphysematous changes.  A few punctate
calcified granulomas.  Incidental lung cysts.
-AIRWAYS:  The airways are patent to the subsegmental level.
-VESSELS:  The pulmonary artery measures at the upper limits of normal (31
mm).  No pulmonary arterial filling defects.
CHEST CAGE: Spondylotic changes of the thoracic spine.  No lytic/ destructive
bony lesions.

IMPRESSION:

Two irregular, spiculated part solid nodules, the largest in the right upper
lobe measuring 11 mm in diameter.  These nodules do not have the typical
appearance of metastasis, but are concerning for lesions in the lung
adenocarcinoma spectrum.

Small indeterminate round 3 mm pulmonary nodule seen in the left lower lobe.

2 subcentimeter soft tissue nodules in the left breast, for which correlation
with mammography advised if warranted clinically.

RECOMMENDATION(S):  The larger spiculated part solid nodule in the right upper
lobe measures 11 mm in diameter.  Thus, PET-CT imaging may be performed for
better characterization.

Alternatively consider a 3 month follow-up CT for re-evaluation of all
nodules.`,
  },
];
