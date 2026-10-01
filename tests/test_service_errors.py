import unittest
import server


class ServiceErrorTests(unittest.TestCase):
    def error(self, code, kind='insufficient_quota'):
        return server.coaching_error(429, {'error': {'code': code, 'type': kind, 'message': 'SECRET SHOULD NOT BE DISPLAYED'}})

    def test_exhausted_credits_link_to_billing(self):
        result = self.error('credit_balance_exhausted')
        self.assertEqual(result['actions'], ['billing'])
        self.assertNotIn('SECRET', str(result))

    def test_project_limit_takes_precedence_over_broad_quota_type(self):
        self.assertEqual(self.error('project_spend_limit_exceeded')['actions'], ['projects'])
        self.assertEqual(self.error('organization_spend_limit_exceeded')['actions'], ['limits'])

    def test_temporary_limit_uses_retry_after_not_billing(self):
        result = server.coaching_error(429, {'error': {'code': 'rate_limit_exceeded'}}, '32')
        self.assertEqual(result['actions'], ['limits'])
        self.assertIn('32 seconds', result['message'])

    def test_legacy_429_does_not_claim_credits_are_exhausted(self):
        result = server.coaching_error(429)
        self.assertEqual(result['actions'], ['billing', 'limits'])
        self.assertIn('exact cause was not available', result['message'])

    def test_non_json_provider_error_has_safe_fallback(self):
        self.assertEqual(server.coaching_error(500, '<html>broken</html>')['actions'], ['errors'])
        self.assertEqual(server.coaching_error(429, {'error': None})['actions'], ['billing', 'limits'])

    def test_unknown_quota_offers_billing_and_limits(self):
        self.assertEqual(self.error('insufficient_quota')['actions'], ['billing', 'limits'])


if __name__ == '__main__': unittest.main()
