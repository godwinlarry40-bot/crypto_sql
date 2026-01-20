'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // START: Added Plan ID 1 to ensure investments can be processed
    await queryInterface.bulkInsert('Plans', [{
      id: 1,
      name: 'Starter Plan',
      description: 'Basic investment plan',
      createdAt: new Date(),
      updatedAt: new Date()
    }], {});
    // END: Added Plan ID 1
  },

  async down(queryInterface, Sequelize) {
    // START: Logic to remove the specific plan added above
    await queryInterface.bulkDelete('Plans', { id: 1 }, {});
    // END: Logic to remove the specific plan
  }
};