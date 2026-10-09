import express from 'express';
import { requireAdmin } from '../middleware/auth.js';

export function createUserProfilesRouter({ supabaseClient }) {
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
    };
  });

  return response.json({
    data,
  });
});

  router.put('/:id/business', requireAdmin, async (request, response) => {
    const { id } = request.params;
    const { business_id } = request.body;

    if (!business_id) {
      return response.status(400).json({
        error: 'business_id is required.',
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

    const { data, error } = await supabaseClient
      .from('profiles')
      .update({
        business_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, role, business_id, created_at, updated_at')
      .single();

    if (error) {
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