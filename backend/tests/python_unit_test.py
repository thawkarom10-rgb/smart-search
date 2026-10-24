"""
Unit tests for Python Reliability Engine.
Tests:
1. Reliability scorer (domain, citations, recency, content length, composite)
2. Semantic conflict analyzer (contradiction detection, negation handling, official protection)
3. Official services registry and typo tolerance
4. Resilient search aggregator
5. Verified answer synthesizer
"""

import sys
import os
import unittest

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from python_engine import reliability_scorer
from python_engine import conflict_analyzer
from python_engine import official_data
from python_engine import verified_synthesizer
from python_engine import search_resilience
from python_engine import service

class TestPythonReliabilityEngine(unittest.TestCase):

    def test_trust_scoring(self):
        academic_result = {
            'domain': 'arxiv.org',
            'url': 'https://arxiv.org/abs/2301.00001',
            'category': 'academic',
            'citations': 8,
            'contentLength': 2500,
            'publishedDate': '2026-01-01'
        }
        score = reliability_scorer.score_trust(academic_result)
        self.assertGreaterEqual(score, 70, f"Expected academic paper to score >= 70, got {score}")
        self.assertEqual(reliability_scorer.get_trust_label(score), 'High')

        breakdown = reliability_scorer.get_score_breakdown(academic_result)
        self.assertIn('domainScore', breakdown)
        self.assertIn('citationScore', breakdown)
        self.assertIn('contentLengthScore', breakdown)
        self.assertIn('recencyScore', breakdown)
        self.assertEqual(breakdown['totalScore'], score)

    def test_relevance_and_composite(self):
        rel_result = {
            'title': 'Understanding Climate Change Causes and Effects',
            'snippet': 'Climate change is primarily caused by greenhouse gas emissions from human activities.',
            'domain': 'nature.com'
        }
        rel_score = reliability_scorer.score_relevance('climate change causes', rel_result)
        self.assertGreater(rel_score, 0, f"Expected positive relevance score, got {rel_score}")

        comp_score = reliability_scorer.calculate_composite_score(rel_score, 80)
        self.assertGreater(comp_score, 0)

    def test_conflict_detection(self):
        result_a = {
            'id': 1,
            'title': 'Coffee benefits study',
            'snippet': 'Coffee is safe and highly beneficial for health, study shows consensus among experts.'
        }
        result_b = {
            'id': 2,
            'title': 'Coffee health risks',
            'snippet': 'Coffee is harmful and dangerous for health, study refutes its benefits.'
        }
        annotated = conflict_analyzer.detect_conflicts([result_a, result_b])
        has_conflict = any(r.get('conflict') for r in annotated)
        self.assertTrue(has_conflict, "Expected conflict to be flagged between contradictory claims")

    def test_negation_awareness(self):
        result_a = {
            'id': 1,
            'snippet': 'Clinical trials show that this treatment is not harmful and has proven benefits.'
        }
        result_b = {
            'id': 2,
            'snippet': 'Treatment is proven effective and safe for general use.'
        }
        # Both are positive ("not harmful" is not negative); they should not conflict!
        annotated = conflict_analyzer.detect_conflicts([result_a, result_b])
        conflicts = [r for r in annotated if r.get('conflict')]
        self.assertEqual(len(conflicts), 0, "Negated negative ('not harmful') should not trigger false conflict")

    def test_official_services_and_typos(self):
        # 1. Driving license match
        service = official_data.find_official_service('driving license')
        self.assertIsNotNone(service)
        self.assertEqual(service['domain'], 'parivahan.gov.in')

        # 2. Typo tolerance: "driving licenes"
        service_typo = official_data.find_official_service('driving licenes')
        self.assertIsNotNone(service_typo)
        self.assertEqual(service_typo['domain'], 'parivahan.gov.in')

        # 3. Verified answer for driving license
        dl_answer = verified_synthesizer.get_verified_answer('driving license', [])
        self.assertTrue(dl_answer['found'])
        self.assertIsNotNone(dl_answer.get('officialPortal'))
        self.assertEqual(dl_answer['officialPortal']['domain'], 'parivahan.gov.in')
        self.assertGreater(len(dl_answer['keyPoints']), 0)

    def test_process_search_pipeline(self):
        pipeline_output = service.process_search_pipeline(
            'who invented the internet',
            [
                {
                    'title': 'History of the Internet',
                    'snippet': 'Vint Cerf and Bob Kahn invented the TCP/IP protocols that form the foundation of the internet.',
                    'domain': 'wikipedia.org',
                    'citations': 6,
                    'contentLength': 2500
                }
            ]
        )
        self.assertIn('results', pipeline_output)
        self.assertIn('verified', pipeline_output)
        self.assertEqual(pipeline_output['engine'], 'Python 3 Reliability Engine')
        self.assertGreater(len(pipeline_output['results']), 0)
        self.assertTrue(pipeline_output['verified']['found'])

if __name__ == '__main__':
    unittest.main()
