import express from 'express';
import { requireAdmin } from '../middleware/auth.js';

export function createUserProfilesRouter({ supabaseClient } = {}) {
  const router = express.Router();

router.get('/', requireAdmin, async (_request, response) => {
  const { data: profiles, error: profileError } =
    await supabaseClient
      .from('profiles')
      .select('id, role, business_id, created_at')
      .order('created_at', { ascending: true });

  if (profileError) {
    return response.status(500).json({
      error: 'Unable to fetch user profiles.',
    });
  }

  const { data: memberships, error: membershipsError } = await supabaseClient
    .from('business_memberships')
    .select('user_id, business_id, role');

  if (membershipsError) {
    return response.status(500).json({
      error: 'Unable to fetch user memberships.',
    });
  }

  const { data: usersData, error: usersError } =
    await supabaseClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

  if (usersError) {
    return response.status(500).json({
      error: 'Unable to fetch user emails.',
    });
  }

  const users = usersData?.users ?? [];

  const data = (profiles ?? []).map((profile) => {
    const user = users.find(
      (item) => item.id === profile.id
    );

    return {
      ...profile,
      email: user?.email ?? '',
      membership_role:
        memberships?.find(
          (membership) =>
            membership.user_id === profile.id &&
            membership.business_id === profile.business_id,
        )?.role ?? null,
    };
  });

  return response.json({
    data,
  });
});

  router.put('/:id/business', requireAdmin, async (request, response) => {
    const { id } = request.params;
    const { business_id, membership_role = 'receptionist' } = request.body;

    if (!business_id) {
      return response.status(400).json({
        error: 'business_id is required.',
      });
    }

    if (!['receptionist', 'owner'].includes(membership_role)) {
      return response.status(400).json({
        error: 'membership_role must be either receptionist or owner.',
      });
    }

    const { data: business, error: businessError } =
      await supabaseClient
        .from('businesses')
        .select('id')
        .eq('id', business_id)
        .single();

    if (businessError || !business) {
      return response.status(400).json({
        error: 'Business not found.',
      });
    }

    const { data: profile, error: profileError } =
      await supabaseClient
        .from('profiles')
        .select('id, role, business_id')
        .eq('id', id)
        .single();

    if (profileError || !profile) {
      return response.status(404).json({
        error: 'User profile not found.',
      });
    }

    if (profile.role !== 'client') {
      return response.status(400).json({
        error: 'Only client users can be assigned to a business.',
      });
    }

    const { data, error } = await supabaseClient.rpc(
      'assign_client_profile_business',
      {
        p_profile_id: id,
        p_business_id: business_id,
        p_expected_business_id: profile.business_id ?? null,
        p_actor_user_id: request.user?.id ?? null,
        p_membership_role: membership_role,
      },
    );

    if (error) {
      if (error.code === 'P0004') {
        return response.status(409).json({
          error: 'Business assignment changed. Please refresh and try again.',
        });
      }

      if (error.code === 'P0001') {
        return response.status(409).json({
          error:
            'Cannot change this membership because the business must retain at least one owner. Assign another owner first.',
        });
      }

      console.error('Business assignment RPC failed:', {
        code: error?.code ?? null,
        message: error?.message ?? 'Unknown RPC error',
      });

      return response.status(500).json({
        error: 'Unable to assign business.',
      });
    }

    return response.json({
      data,
    });
  });

  return router;
}
