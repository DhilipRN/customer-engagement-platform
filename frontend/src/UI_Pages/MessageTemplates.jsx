import { useMemo, useState } from 'react';

const CATEGORY_OPTIONS = [
  { value: 'utility', label: 'Utility' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'authentication', label: 'Authentication' },
  { value: 'review', label: 'Review' },
  { value: 'promotional', label: 'Promotional' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'other', label: 'Other' },
];

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'utility', label: 'Utility' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'review', label: 'Review' },
  { value: 'transactional', label: 'Transactional' },
];

const LANGUAGES = [
  { value: 'en', label: 'English (en)' },
  { value: 'te', label: 'Telugu (te)' },
  { value: 'hi', label: 'Hindi (hi)' },
];

const VARIABLES = [
  'customer_name',
  'business_name',
  'review_link',
  'product_name',
  'purchase_date',
];

const emptyMetadata = () => ({
  meta_template_name: '',
  language: 'en',
  header: '',
  footer: '',
  buttons: [],
});

const normalizeMetadata = (metadata) => ({
  ...emptyMetadata(),
  ...(metadata && typeof metadata === 'object' ? metadata : {}),
  buttons: Array.isArray(metadata?.buttons) ? metadata.buttons : [],
});

const categoryLabel = (category) =>
  CATEGORY_OPTIONS.find((option) => option.value === category)?.label || category || 'Other';

const effectiveCategory = (template) =>
  template?.metadata?.meta_category || template?.category || 'other';

const categoryClass = (category) => `template-category-${category || 'other'}`;

const updateTemplateMetadata = (form, setForm, changes) => {
  setForm({
    ...form,
    metadata: { ...normalizeMetadata(form.metadata), ...changes },
  });
};

function PhonePreview({ template }) {
  const metadata = normalizeMetadata(template?.metadata);
  const body = template?.message || 'Your message preview will appear here.';
  const parts = body.split(/(\{\{[^}]+\}\})/g);

  return (
    <div className="template-phone-preview">
      <div className="template-phone-topbar"><span>‹</span><strong>{metadata.header || template?.businessName || 'Connectly'}</strong><span>⋮</span></div>
      <div className="template-phone-wallpaper">
        <div className="template-chat-bubble">
          {metadata.header && <div className="template-preview-header">{metadata.header}</div>}
          <div className="template-preview-body">
            {parts.map((part, index) => part.startsWith('{{') ? <mark key={index}>{part}</mark> : part)}
          </div>
          {metadata.footer && <div className="template-preview-footer">{metadata.footer}</div>}
          {metadata.buttons.map((button, index) => (
            <div className="template-preview-button" key={`${button.text}-${index}`}>
              <span>{button.type === 'cta' ? '↗' : '✓'}</span>{button.text}
            </div>
          ))}
          <small>10:42 AM ✓✓</small>
        </div>
      </div>
    </div>
  );
}

function TemplateEditor({
  title,
  form,
  setForm,
  businesses,
  submitting,
  onSubmit,
  onCancel,
  submitLabel,
  message,
}) {
  const metadata = normalizeMetadata(form.metadata);
  const setField = (field, value) => setForm({ ...form, [field]: value });
  const isCreate = title.startsWith('Create');

  const addButton = () => {
    if (metadata.buttons.length >= 3) return;
    updateTemplateMetadata(form, setForm, {
      buttons: [...metadata.buttons, { type: 'quick_reply', text: '' }],
    });
  };

  const updateButton = (index, changes) => {
    updateTemplateMetadata(form, setForm, {
      buttons: metadata.buttons.map((button, buttonIndex) =>
        buttonIndex === index ? { ...button, ...changes } : button
      ),
    });
  };

  const removeButton = (index) => {
    updateTemplateMetadata(form, setForm, {
      buttons: metadata.buttons.filter((_, buttonIndex) => buttonIndex !== index),
    });
  };

  return (
    <div className="template-editor-shell">
      <div className="template-editor-form">
        <div className="template-editor-heading"><div><span className="section-kicker">WhatsApp template</span><h3>{title}</h3></div><button type="button" className="template-close-button" onClick={onCancel}>×</button></div>
        <form onSubmit={onSubmit}>
          {isCreate && <label>Business<select value={form.business_id} onChange={(event) => setField('business_id', event.target.value)} required><option value="">Select a business</option>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></label>}
          <div className="template-form-grid">
            <label>Template name<input value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="Review request" required /></label>
            <label>Meta template name <span className="field-hint">optional</span><input value={metadata.meta_template_name} onChange={(event) => updateTemplateMetadata(form, setForm, { meta_template_name: event.target.value })} placeholder="appointment_reminder_v1" /></label>
            <label>Category<select value={form.category} onChange={(event) => setField('category', event.target.value)} required><option value="">Select a category</option>{CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label>Language<select value={metadata.language} onChange={(event) => updateTemplateMetadata(form, setForm, { language: event.target.value })}>{LANGUAGES.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}</select></label>
          </div>
          <div className="template-form-grid"><label>Header <span className="field-hint">optional</span><input value={metadata.header} onChange={(event) => updateTemplateMetadata(form, setForm, { header: event.target.value })} placeholder="Clinic appointment" /></label><label>Footer <span className="field-hint">optional</span><input value={metadata.footer} onChange={(event) => updateTemplateMetadata(form, setForm, { footer: event.target.value })} placeholder="Reply to this message for help" /></label></div>
          <label>Message body<textarea value={form.message} onChange={(event) => setField('message', event.target.value)} placeholder="Hi {{customer_name}}, ..." rows="5" required /></label>
          <div className="template-variable-picker"><span>Insert variable</span>{VARIABLES.map((variable) => <button type="button" key={variable} onClick={() => setField('message', `${form.message || ''} {{${variable}}}`)}>{`{{${variable}}}`}</button>)}</div>
          <div className="template-buttons-builder"><div className="template-builder-heading"><div><strong>Interactive buttons</strong><span>Quick replies and call-to-action links</span></div><button type="button" className="button-secondary button-compact" onClick={addButton} disabled={metadata.buttons.length >= 3}>+ Add button</button></div>{metadata.buttons.length === 0 && <p className="template-empty-builder">No buttons yet. Add up to three interactive buttons.</p>}{metadata.buttons.map((button, index) => <div className="template-button-row" key={index}><select value={button.type} onChange={(event) => updateButton(index, { type: event.target.value })}><option value="quick_reply">Quick reply</option><option value="cta">Call to action</option></select><input value={button.text || ''} onChange={(event) => updateButton(index, { text: event.target.value })} placeholder={button.type === 'cta' ? 'Visit website' : 'Confirm appointment'} required />{button.type === 'cta' && <input value={button.url || ''} onChange={(event) => updateButton(index, { url: event.target.value })} placeholder="https://example.com" type="url" required />}<button type="button" className="template-remove-button" onClick={() => removeButton(index)}>Remove</button></div>)}</div>
          <div className="template-editor-actions"><button type="submit" className="button-primary" disabled={submitting}>{submitting ? 'Saving…' : submitLabel}</button><button type="button" className="button-secondary" onClick={onCancel} disabled={submitting}>Cancel</button></div>
          {message && <p className="template-inline-message">{message}</p>}
        </form>
      </div>
      <div className="template-editor-preview"><div className="preview-heading"><span className="section-kicker">Live preview</span><strong>WhatsApp phone preview</strong></div><PhonePreview template={{ ...form, metadata }} /></div>
    </div>
  );
}

function MessageTemplates({
  businesses, messageTemplates, templateLoading, templateError, newTemplate, setNewTemplate,
  templateSubmitting, templateMessage, handleAddTemplate, editingTemplate, editTemplateForm,
  setEditTemplateForm, templateActionLoading, handleEditTemplate, setEditingTemplate,
  startEditingTemplate, handleDeleteTemplate,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const pageSize = 12;

  const filteredTemplates = useMemo(() => messageTemplates.filter((template) => {
    const search = searchTerm.trim().toLowerCase();
    const category = effectiveCategory(template);
    const matchesCategory = categoryFilter === 'all' || category === categoryFilter;
    return matchesCategory && [template.name, template.businessName, category, template.message, template.metadata?.meta_template_name].some((value) => String(value || '').toLowerCase().includes(search));
  }), [messageTemplates, searchTerm, categoryFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedTemplates = filteredTemplates.slice((safePage - 1) * pageSize, safePage * pageSize);
  const openCreate = () => { setEditingTemplate(null); setEditorOpen(true); };
  const openEdit = (template) => { startEditingTemplate(template); setEditorOpen(true); };
  const closeEditor = () => { setEditorOpen(false); setEditingTemplate(null); };

  return (
    <section className="message-templates-page">
      <div className="message-templates-hero"><div><span className="section-kicker">Messaging workspace</span><h2>Message Templates</h2><p>Build reusable WhatsApp experiences with clear copy, variables, and interactive actions.</p></div><button type="button" className="button-primary template-create-button" onClick={openCreate}>＋ Create Template</button></div>
      <div className="template-toolbar"><div className="template-search-wrap"><span>⌕</span><input aria-label="Search message templates" type="search" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setCurrentPage(1); }} placeholder="Search templates, businesses or copy…" /></div><div className="template-filter-pills" aria-label="Template category filter">{FILTERS.map((filter) => <button type="button" className={categoryFilter === filter.value ? 'active' : ''} key={filter.value} onClick={() => { setCategoryFilter(filter.value); setCurrentPage(1); }}>{filter.label}</button>)}</div><div className="template-result-count">{filteredTemplates.length} templates</div></div>
      {editorOpen && <TemplateEditor title={editingTemplate ? 'Edit template' : 'Create a template'} form={editingTemplate ? editTemplateForm : newTemplate} setForm={editingTemplate ? setEditTemplateForm : setNewTemplate} businesses={businesses} submitting={editingTemplate ? templateActionLoading : templateSubmitting} onSubmit={editingTemplate ? handleEditTemplate : handleAddTemplate} onCancel={closeEditor} submitLabel={editingTemplate ? 'Save changes' : 'Create template'} message={editingTemplate ? '' : templateMessage} />}
      {templateLoading ? <div className="template-state-card">Loading message templates…</div> : templateError ? <div className="template-state-card template-state-error">{templateError}</div> : messageTemplates.length === 0 ? <div className="template-state-card"><strong>No message templates yet</strong><p>Create your first WhatsApp template to get started.</p></div> : filteredTemplates.length === 0 ? <div className="template-state-card"><strong>No templates match these filters</strong><p>Try a different category or search term.</p></div> : <><div className="template-card-grid">{paginatedTemplates.map((template) => { const metadata = normalizeMetadata(template.metadata); const category = effectiveCategory(template); return <article className="template-manager-card" key={template.id}><div className="template-card-topline"><span className={`template-category-badge ${categoryClass(category)}`}>{categoryLabel(category)}</span><span className="template-language-badge">{metadata.language || 'en'}</span></div><h3>{template.name}</h3><p className="template-card-business">{template.businessName || 'Business template'}{metadata.meta_template_name && <span> · {metadata.meta_template_name}</span>}</p><p className="template-card-message">{template.message}</p><div className="template-card-meta"><span>{(template.message.match(/\{\{[^}]+\}\}/g) || []).length} variables</span><span>{metadata.buttons.length} {metadata.buttons.length === 1 ? 'button' : 'buttons'}</span></div><div className="template-card-actions"><button type="button" onClick={() => setPreviewTemplate(template)}>Preview</button><button type="button" onClick={() => openEdit(template)}>Edit</button><button type="button" className="danger" onClick={() => handleDeleteTemplate(template)} disabled={templateActionLoading}>Delete</button></div></article>; })}</div><div className="template-pagination"><span>Showing {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, filteredTemplates.length)} of {filteredTemplates.length}</span><div><button type="button" disabled={safePage === 1} onClick={() => setCurrentPage((page) => page - 1)}>Previous</button>{Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => <button type="button" className={page === safePage ? 'active' : ''} key={page} onClick={() => setCurrentPage(page)}>{page}</button>)}<button type="button" disabled={safePage === totalPages} onClick={() => setCurrentPage((page) => page + 1)}>Next</button></div></div></>}
      {previewTemplate && <div className="template-preview-overlay" role="presentation" onClick={() => setPreviewTemplate(null)}><div className="template-preview-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="preview-heading"><div><span className="section-kicker">Quick preview</span><strong>{previewTemplate.name}</strong></div><button type="button" className="template-close-button" onClick={() => setPreviewTemplate(null)}>×</button></div><PhonePreview template={previewTemplate} /></div></div>}
    </section>
  );
}

export default MessageTemplates;
