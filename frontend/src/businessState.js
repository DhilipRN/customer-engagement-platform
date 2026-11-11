export function applyBusinessMutation(businesses, operation, business) {
  if (operation === 'create') {
    return [business, ...businesses];
  }

  if (operation === 'update') {
    return businesses.map((item) => (
      item.id === business.id ? { ...item, ...business } : item
    ));
  }

  if (operation === 'delete') {
    return businesses.filter((item) => item.id !== business.id);
  }

  return businesses;
}

export function getBusinessAuditWarning(result) {
  return typeof result?.warning === 'string' ? result.warning : '';
}
