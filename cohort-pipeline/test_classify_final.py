import unittest

from classify_final import analyze


def coronary_report(section):
    return f"""
FINDINGS:
CORONARY ARTERIES:
{section}
"""


class ClassifyFinalLateralityTest(unittest.TestCase):
    def assert_laterality(self, section, expected):
        relevant, prepost, laterality, *_ = analyze(coronary_report(section))
        self.assertTrue(relevant)
        self.assertEqual(prepost, "pre")
        self.assertEqual(laterality, expected)

    def test_ignores_cad_rads_template_example(self):
        relevant, *_ = analyze(coronary_report("""
* ORIGINS: Normal origin of the coronary arteries.
CAD-RADS 2.0
MODIFIERS
Exceptions: identification of non-atherosclerotic causes of obstruction
(example: anomalous coronary artery with inter-arterial course).
Adapted from Cury RC, et al.
IMPRESSION:
No evidence of obstructive coronary stenosis.
"""))
        self.assertFalse(relevant)

    def test_mismatch_does_not_cross_calcium_score_lines(self):
        relevant, *_ = analyze(coronary_report("""
Calcium score: LM: 0  LAD: 2.4
Circumflex: 0
RCA: 0
RCA:
The RCA arises from the right coronary cusp.
LEFT MAIN ARTERY:
The left main coronary artery arises from the left coronary cusp.
IMPRESSION:
Conventional coronary artery anatomy with right dominant coronary artery system.
"""))
        self.assertFalse(relevant)

    def test_variant_rca_takeoff_from_left_main_is_right(self):
        self.assert_laterality("""
Anatomy: Variant coronary artery anatomy with the RCA arising off the left main
coronary artery with an inter-arterial course between the aorta and pulmonary artery.
IMPRESSION:
Hypoplastic RCA with variant take-off from the left main coronary artery.
""", "RCA")

    def test_rca_from_left_coronary_artery_cusp_is_right(self):
        self.assert_laterality("""
Right coronary artery: Anomalous dominant right coronary artery arises from the
left coronary artery cusp and demonstrates a proximal interarterial course.
""", "RCA")

    def test_lcx_from_right_coronary_artery_is_left(self):
        self.assert_laterality("""
Left circumflex: Aberrant origin of the left circumflex arising from the right
coronary artery and continues as the obtuse marginal.
""", "LEFT")


if __name__ == "__main__":
    unittest.main()
