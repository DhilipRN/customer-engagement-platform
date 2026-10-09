import { Router } from 'express';

import { createAppointmentService } from '../services/Appointments.js';
import { createBusinessService } from '../services/businesses.js';
import { createCustomerService } from '../services/customers.js';
import { createMessageTemplateService } from '../services/messageTemplates.js';
import { requireBusinessAccess } from '../middleware/auth.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;

const STATUSES = [
  'scheduled',
  'completed',
  'cancelled',
  'no_show',
];

function isValidUuid(value) {
  return (
    typeof value === 'string' &&
    UUID_PATTERN.test(value)
  );
}

function isValidDate(value) {
  if (
    typeof value !== 'string' ||
    !DATE_PATTERN.test(value)
  ) {
    return false;
  }

  const date = new Date(
    `${value}T00:00:00.000Z`
  );

  return (
    !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function isValidTime(value) {
  if (
    typeof value !== 'string' ||
    !TIME_PATTERN.test(value)
  ) {
    return false;
  }

  const [hours, minutes, seconds = '00'] =
    value.split(':').map(Number);

  return (
    Number.isInteger(hours) &&
    Number.isInteger(minutes) &&
    Number.isInteger(Number(seconds)) &&
    hours >= 0 &&
    hours <= 23 &&
    minutes >= 0 &&
    minutes <= 59 &&
    Number(seconds) >= 0 &&
    Number(seconds) <= 59
  );
}

function validateAppointment(
  payload,
  { creating = false } = {}
) {
  const errors = [];
  const values = {};

  if (creating) {
    if (!isValidUuid(payload.business_id)) {
      errors.push(
        'business_id must be a valid UUID.'
      );
    } else {
      values.business_id = payload.business_id;
    }

    if (!isValidUuid(payload.customer_id)) {
      errors.push(
        'customer_id must be a valid UUID.'
      );
    } else {
      values.customer_id = payload.customer_id;
    }
  }

  if (
    payload.appointment_date !== undefined
  ) {
    if (
      !isValidDate(
        payload.appointment_date
      )
    ) {
      errors.push(
        'appointment_date must be a valid YYYY-MM-DD date.'
      );
    } else {
      values.appointment_date =
        payload.appointment_date;
    }
  } else if (creating) {
    errors.push(
      'appointment_date is required.'
    );
  }

  if (
    payload.appointment_time !== undefined
  ) {
    if (
      !isValidTime(
        payload.appointment_time
      )
    ) {
      errors.push(
        'appointment_time must be a valid time.'
      );
    } else {
      values.appointment_time =
        payload.appointment_time;
    }
  } else if (creating) {
    errors.push(
      'appointment_time is required.'
    );
  }

  if (
    payload.appointment_type !== undefined
  ) {
    if (
      typeof payload.appointment_type !==
        'string' ||
      !payload.appointment_type.trim()
    ) {
      errors.push(
        'appointment_type must be a non-empty string.'
      );
    } else {
      values.appointment_type =
        payload.appointment_type.trim();
    }
  } else if (creating) {
    errors.push(
      'appointment_type is required.'
    );
  }

  if (
    payload.reminder_enabled !== undefined
  ) {
    if (
      typeof payload.reminder_enabled !==
      'boolean'
    ) {
      errors.push(
        'reminder_enabled must be a boolean.'
      );
    } else {
      values.reminder_enabled =
        payload.reminder_enabled;
    }
  }

  if (
    payload.reminder_minutes !== undefined
  ) {
    if (
      !Number.isInteger(
        payload.reminder_minutes
      ) ||
      payload.reminder_minutes < 0
    ) {
      errors.push(
        'reminder_minutes must be a non-negative integer.'
      );
    } else {
      values.reminder_minutes =
        payload.reminder_minutes;
    }
  }

  if (
    payload.template_id !== undefined
  ) {
    if (
      payload.template_id !== null &&
      !isValidUuid(
        payload.template_id
      )
    ) {
      errors.push(
        'template_id must be a valid UUID or null.'
      );
    } else {
      values.template_id =
        payload.template_id;
    }
  }

  if (payload.status !== undefined) {
    if (
      typeof payload.status !== 'string' ||
      !STATUSES.includes(
        payload.status
      )
    ) {
      errors.push(
        `status must be one of: ${STATUSES.join(
          ', '
        )}.`
      );
    } else {
      values.status = payload.status;
    }
  }

  return {
    errors,
    values,
  };
}

function sendDatabaseError(
  response,
  error
) {
  console.error(error);

  return response.status(500).json({
    error:
      'Unable to process the appointment request.',
  });
}

export function createAppointmentsRouter({
  appointmentService,
  businessService,
  customerService,
  messageTemplateService,
} = {}) {
  const router = Router();

  let resolvedAppointmentService =
    appointmentService;
  let resolvedBusinessService =
    businessService;
  let resolvedCustomerService =
    customerService;
  let resolvedMessageTemplateService =
    messageTemplateService;

  function getAppointmentService() {
    if (!resolvedAppointmentService) {
      resolvedAppointmentService =
        createAppointmentService();
    }

    return resolvedAppointmentService;
  }

  function getBusinessService() {
    if (!resolvedBusinessService) {
      resolvedBusinessService =
        createBusinessService();
    }

    return resolvedBusinessService;
  }

  function getCustomerService() {
    if (!resolvedCustomerService) {
      resolvedCustomerService =
        createCustomerService();
    }

    return resolvedCustomerService;
  }

  function getMessageTemplateService() {
    if (!resolvedMessageTemplateService) {
      resolvedMessageTemplateService =
        createMessageTemplateService();
    }

    return resolvedMessageTemplateService;
  }

  async function validateBusiness(
    businessId,
    response
  ) {
    const result =
      await getBusinessService().findById(
        businessId
      );

    if (result.error) {
      sendDatabaseError(
        response,
        result.error
      );
      return false;
    }

    if (!result.data) {
      response.status(404).json({
        error: 'Business not found.',
      });
      return false;
    }

    return true;
  }

  async function validateCustomer(
    businessId,
    customerId,
    response
  ) {
    const result =
      await getCustomerService().findById(
        customerId
      );

    if (result.error) {
      sendDatabaseError(
        response,
        result.error
      );
      return false;
    }

    if (!result.data) {
      response.status(404).json({
        error: 'Customer not found.',
      });
      return false;
    }

    if (
      result.data.business_id !==
      businessId
    ) {
      response.status(400).json({
        error:
          'Customer does not belong to the selected business.',
      });
      return false;
    }

    return true;
  }

  async function validateTemplate(
    businessId,
    templateId,
    response
  ) {
    if (templateId === null) {
      return true;
    }

    const result =
      await getMessageTemplateService().findById(
        templateId
      );

    if (result.error) {
      sendDatabaseError(
        response,
        result.error
      );
      return false;
    }

    if (!result.data) {
      response.status(404).json({
        error: 'Message template not found.',
      });
      return false;
    }

    if (
      result.data.business_id !==
      businessId
    ) {
      response.status(400).json({
        error:
          'Message template does not belong to the selected business.',
      });
      return false;
    }

    return true;
  }

  router.get('/', requireBusinessAccess, async (request, response) => {
    const {
      business_id: businessId,
    } = request.query;

    if (!isValidUuid(businessId)) {
      return response.status(400).json({
        error:
          'business_id query parameter must be a valid UUID.',
      });
    }

    if (
      !(await validateBusiness(
        businessId,
        response
      ))
    ) {
      return undefined;
    }

    const {
      data,
      error,
    } =
      await getAppointmentService().listByBusinessId(
        businessId
      );

    if (error) {
      return sendDatabaseError(
        response,
        error
      );
    }

    return response.status(200).json({
      data,
    });
  });

  router.get(
    '/:id',
    requireBusinessAccess,
    async (request, response) => {
      if (
        !isValidUuid(
          request.params.id
        )
      ) {
        return response.status(400).json({
          error:
            'appointment id must be a valid UUID.',
        });
      }

      const {
        data,
        error,
      } =
        await getAppointmentService().findById(
          request.params.id,
          request.profile?.role === 'client'
            ? request.profile.business_id
            : null
        );

      if (error) {
        return sendDatabaseError(
          response,
          error
        );
      }

      if (!data) {
        return response.status(404).json({
          error:
            'Appointment not found.',
        });
      }

      return response.status(200).json({
        data,
      });
    }
  );

  router.post(
    '/',
    requireBusinessAccess,
    async (request, response) => {
      const {
        errors,
        values,
      } =
        validateAppointment(
          request.body ?? {},
          { creating: true }
        );

      if (errors.length) {
        return response.status(400).json({
          errors,
        });
      }

      if (
        !(await validateBusiness(
          values.business_id,
          response
        ))
      ) {
        return undefined;
      }

      if (
        !(await validateCustomer(
          values.business_id,
          values.customer_id,
          response
        ))
      ) {
        return undefined;
      }

      if (
        !(await validateTemplate(
          values.business_id,
          values.template_id ??
            null,
          response
        ))
      ) {
        return undefined;
      }

      const {
        data,
        error,
      } =
        await getAppointmentService().create(
          {
            ...values,
            status:
              values.status ??
              'scheduled',
            reminder_enabled:
              values.reminder_enabled ??
              true,
            reminder_minutes:
              values.reminder_minutes ??
              1440,
            template_id:
              values.template_id ??
              null,
          }
        );

      if (error) {
        return sendDatabaseError(
          response,
          error
        );
      }

      return response.status(201).json({
        data,
      });
    }
  );

  router.put(
    '/:id',
    requireBusinessAccess,
    async (request, response) => {
      if (
        !isValidUuid(
          request.params.id
        )
      ) {
        return response.status(400).json({
          error:
            'appointment id must be a valid UUID.',
        });
      }

      const {
        errors,
        values,
      } =
        validateAppointment(
          request.body ?? {}
        );

      if (!Object.keys(values).length) {
        errors.push(
          'At least one editable field is required.'
        );
      }

      if (errors.length) {
        return response.status(400).json({
          errors,
        });
      }

      const businessScope =
        request.profile?.role === 'client'
          ? request.profile.business_id
          : null;
      const existingResult =
        await getAppointmentService().findById(
          request.params.id,
          businessScope
        );

      if (existingResult.error) {
        return sendDatabaseError(
          response,
          existingResult.error
        );
      }

      if (!existingResult.data) {
        return response.status(404).json({
          error:
            'Appointment not found.',
        });
      }

      const businessId =
        existingResult.data.business_id;

      if (
        values.template_id !== undefined &&
        !(await validateTemplate(
          businessId,
          values.template_id,
          response
        ))
      ) {
        return undefined;
      }

      if (
        values.customer_id !== undefined &&
        !(await validateCustomer(
          businessId,
          values.customer_id,
          response
        ))
      ) {
        return undefined;
      }

      const {
        data,
        error,
      } =
        await getAppointmentService().update(
          request.params.id,
          values,
          businessScope
        );

      if (error) {
        return sendDatabaseError(
          response,
          error
        );
      }

      if (!data) {
        return response.status(404).json({
          error:
            'Appointment not found.',
        });
      }

      return response.status(200).json({
        data,
      });
    }
  );

  router.delete(
    '/:id',
    requireBusinessAccess,
    async (request, response) => {
      if (
        !isValidUuid(
          request.params.id
        )
      ) {
        return response.status(400).json({
          error:
            'appointment id must be a valid UUID.',
        });
      }

      const {
        data,
        error,
      } =
        await getAppointmentService().remove(
          request.params.id,
          request.profile?.role === 'client'
            ? request.profile.business_id
            : null
        );

      if (error) {
        return sendDatabaseError(
          response,
          error
        );
      }

      if (!data) {
        return response.status(404).json({
          error:
            'Appointment not found.',
        });
      }

      return response.status(204).send();
    }
  );

  return router;
}
