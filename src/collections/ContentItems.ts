import type { CollectionConfig } from 'payload'

import { lexicalEditor } from '@payloadcms/richtext-lexical'

import { isEditorFieldLevel } from '../access'
import {
  canCreateContentItems,
  canDeleteContentItems,
  canReadContentItems,
  canUpdateContentItems,
} from '../access/contentItems'
import { broadcastChange, broadcastDelete } from '../hooks/broadcastChange'
import { enforceStatusStateMachine } from '../hooks/enforceStatusStateMachine'
import { stampAudit } from '../hooks/stampAudit'

export const ContentItems: CollectionConfig = {
  slug: 'content-items',
  // Leverage Payload's built-in concurrent-edit guard in the admin UI: a doc
  // being edited is locked (with takeover) for other users for `duration` secs.
  lockDocuments: { duration: 300 },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'type', 'deadline', 'updatedBy'],
    group: 'Editorial',
  },
  access: {
    read: canReadContentItems,
    create: canCreateContentItems,
    update: canUpdateContentItems,
    delete: canDeleteContentItems,
  },
  hooks: {
    // Order matters: guard the transition first, then stamp the audit trail.
    beforeChange: [enforceStatusStateMachine, stampAudit],
    afterChange: [broadcastChange],
    afterDelete: [broadcastDelete],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'idea',
      options: [
        { label: 'Idea', value: 'idea' },
        { label: 'Draft', value: 'draft' },
        { label: 'Review', value: 'review' },
        { label: 'Published', value: 'published' },
        { label: 'Archived', value: 'archived' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'article',
      options: [
        { label: 'Article', value: 'article' },
        { label: 'Video', value: 'video' },
        { label: 'Podcast', value: 'podcast' },
        { label: 'Newsletter', value: 'newsletter' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      required: true,
      admin: {
        description: 'Contributors can only see/edit items where they are an author.',
      },
    },
    {
      name: 'deadline',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
        // Colour the list-view cell by urgency so editors triage at a glance.
        components: { Cell: '@/components/admin/DeadlineCell#DeadlineCell' },
      },
    },
    {
      name: 'content',
      type: 'richText',
      editor: lexicalEditor(),
      admin: {
        description: 'Body copy. Concurrent-edit safe via Payload document locking (see §3).',
      },
    },

    // ---------------------------------------------------------------------
    // "Wow" fields
    // ---------------------------------------------------------------------
    {
      name: 'isArchived',
      type: 'checkbox',
      defaultValue: false,
      // Soft delete: only Editors may archive / restore an item.
      access: { update: isEditorFieldLevel },
      admin: {
        position: 'sidebar',
        description: 'Archived items drop out of the editorial pipeline.',
      },
    },
    {
      name: 'updatedBy',
      type: 'relationship',
      relationTo: 'users',
      // Maintained exclusively by the stampAudit hook — never client-writable.
      access: { update: () => false },
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'auditLog',
      type: 'array',
      access: { update: () => false },
      admin: { readOnly: true, initCollapsed: true },
      fields: [
        { name: 'user', type: 'relationship', relationTo: 'users' },
        { name: 'action', type: 'text' },
        { name: 'status', type: 'text' },
        { name: 'at', type: 'date' },
      ],
    },
  ],
}
