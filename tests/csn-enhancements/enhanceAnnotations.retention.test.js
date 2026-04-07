const cds = require('@sap/cds');
cds._dpi = {
  buildMessages: [],
};
cds._dpi.log = function log(module, options) {
  return cds.log(module, options);
};
const enhanceAnnotations = require('../../lib/csn-enhancements/shared/enhanceAnnotations.js');
const ilmObjectEntityOrder = 'sap.ilm.bookshop.Orders';
const dataSubjectEntityCustomer = 'sap.ilm.bookshop.Customers';
const dataSubjectEntityVendors = 'sap.ilm.bookshop.Vendors';

let model;
beforeEach(async () => {
  model = await cds.load([
    './srv/DPIInformation.cds',
    './srv/TableHeaderBlocking.cds',
    './tests/csn-enhancements/scenarios/enhanceAnnotationsRetention.cds',
  ]);
});

describe('Communication annotations - Email', () => {
  test('should mark element with @Communication.IsEmailAddress as personal', async () => {
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.newEmail[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBeFalsy();
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.newEmail[
        '@Communication.IsEmailAddress'
      ],
    ).toBeTruthy();
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.newEmail[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBe(true);
  });

  test('should handle multiple Contact.email entries', async () => {
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.newEmail2[
        '@Communication.IsEmailAddress'
      ],
    ).toBeTruthy();
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.newEmail2[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBe(true);
  });
});

describe('Communication annotations - Phone', () => {
  test('should mark element with @Communication.IsPhoneNumber as personal', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.phone[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBe(true);
  });

  test('should mark Contact.tel uri as personal and add IsPhoneNumber', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.phone[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBe(true);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.phone['@Communication.IsPhoneNumber'],
    ).toBe(true);
  });

  test('should handle multiple Contact.tel entries', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.phone[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBe(true);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.phone1[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBe(true);
  });
});

describe('Communication annotations - Name properties', () => {
  test('should mark Contact.n.surname as personal', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.lastName[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBe(true);
  });

  test('should mark Contact.n.given as personal', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.firstName[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBe(true);
  });

  test('should mark Contact.n.additional as personal', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.middleName[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBe(true);
  });

  test('should mark Contact.n.prefix as personal', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.namePrefix[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBe(true);
  });

  test('should mark Contact.n.suffix as personal', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.nameSuffix[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBe(true);
  });

  test('should mark Contact.nickname as personal', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.nickname[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBe(true);
  });

  test('should mark Contact.title as personal', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.title[
        '@PersonalData.IsPotentiallyPersonal'
      ],
    ).toBe(true);
  });
});

describe('Communication annotations - Sensitive properties', () => {
  test('should mark Contact.bday as sensitive', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.dateOfBirth[
        '@PersonalData.IsPotentiallySensitive'
      ],
    ).toBe(true);
  });

  test('should mark Contact.gender as sensitive', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.gender[
        '@PersonalData.IsPotentiallySensitive'
      ],
    ).toBe(true);
  });

  test('should mark Contact.photo as sensitive', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[dataSubjectEntityCustomer].elements.photo[
        '@PersonalData.IsPotentiallySensitive'
      ],
    ).toBe(true);
  });
});

describe('Communication annotations - Address properties', () => {
  test('should mark Contact.adr properties as personal', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[model.definitions[dataSubjectEntityCustomer].elements.postalAddress.target]
        .elements.street['@PersonalData.IsPotentiallyPersonal'],
    ).toBe(true);
    expect(
      model.definitions[model.definitions[dataSubjectEntityCustomer].elements.postalAddress.target]
        .elements.town['@PersonalData.IsPotentiallyPersonal'],
    ).toBe(true);
    expect(
      model.definitions[model.definitions[dataSubjectEntityCustomer].elements.postalAddress.target]
        .elements.country['@PersonalData.IsPotentiallyPersonal'],
    ).toBe(true);
  });

  test('should mark Communication.Address properties as personal', () => {
    enhanceAnnotations(model, model);
    expect(
      model.definitions[model.definitions[dataSubjectEntityCustomer].elements.postalAddress.target]
        .elements.street['@PersonalData.IsPotentiallyPersonal'],
    ).toBe(true);
    expect(
      model.definitions[model.definitions[dataSubjectEntityCustomer].elements.postalAddress.target]
        .elements.town['@PersonalData.IsPotentiallyPersonal'],
    ).toBe(true);
    expect(
      model.definitions[model.definitions[dataSubjectEntityCustomer].elements.postalAddress.target]
        .elements.country['@PersonalData.IsPotentiallyPersonal'],
    ).toBe(true);
  });
});

describe('ILM.BlockingEnabled annotations', () => {
  test('should process $edmJson $Path annotation with service EntityContainer', () => {
    enhanceAnnotations(model, model);
    expect(model.definitions[ilmObjectEntityOrder]['@ILM.BlockingEnabled']).toBeDefined();
    expect(
      model.definitions[ilmObjectEntityOrder]['@ILM.BlockingEnabled.$edmJson.$Path'],
    ).toBeUndefined();
  });

  test('should process $edmJson $Path annotation without EntityContainer', () => {
    model.definitions[ilmObjectEntityOrder]['@ILM.BlockingEnabled.$edmJson.$Path'] =
      '/Settings/isBlocked';
    enhanceAnnotations(model, model);
    expect(model.definitions[ilmObjectEntityOrder]['@ILM.BlockingEnabled']).toBeDefined();
  });
});

test('should handle multiple annotations on same entity', () => {
  enhanceAnnotations(model, model);
  expect(
    model.definitions[dataSubjectEntityCustomer].elements.lastName[
      '@PersonalData.IsPotentiallyPersonal'
    ],
  ).toBe(true);
  expect(
    model.definitions[dataSubjectEntityCustomer].elements.firstName[
      '@PersonalData.IsPotentiallyPersonal'
    ],
  ).toBe(true);
  expect(
    model.definitions[dataSubjectEntityCustomer].elements.dateOfBirth[
      '@PersonalData.IsPotentiallySensitive'
    ],
  ).toBe(true);
});

test('should process multiple entities', () => {
  enhanceAnnotations(model, model);
  expect(
    model.definitions[dataSubjectEntityCustomer].elements.email[
      '@PersonalData.IsPotentiallyPersonal'
    ],
  ).toBe(true);
  expect(
    model.definitions[dataSubjectEntityVendors].elements.phone[
      '@PersonalData.IsPotentiallyPersonal'
    ],
  ).toBe(true);
});
