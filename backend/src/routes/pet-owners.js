import express from 'express';
import { verifyToken, requireRole } from '../middleware/auth.js';
import { pool } from '../config/database.js';
import { uploadPetPhoto, getFileUrl, deleteFile } from '../middleware/upload.js';

const router = express.Router();

// Middleware to require pet_owner role for most routes
const requirePetOwner = requireRole(['pet_owner', 'superadmin']);

// Helper function for safe JSON parsing
const safeJsonParse = (jsonString, defaultValue = {}) => {
  if (!jsonString) return defaultValue;
  if (typeof jsonString === 'object') return jsonString;
  if (typeof jsonString !== 'string') return defaultValue;
  
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('JSON parsing failed:', error.message);
    return defaultValue;
  }
};

// GET /api/pet-owners/profile - Get pet owner profile
router.get('/profile', verifyToken, requirePetOwner, async (req, res) => {
  try {
    const petOwnerId = req.user.uid;
    const connection = await pool.getConnection();
    
    try {
      // Get pet owner profile from database
      const [ownerRows] = await connection.execute(
        'SELECT * FROM pet_owners WHERE id = ?',
        [petOwnerId]
      );
      
      let profile;
      
      if (ownerRows.length === 0) {
        // Pet owner doesn't exist in database yet - create new profile
        const defaultPreferences = JSON.stringify({
          notifications: {
            email: true,
            sms: false,
            push: false
          },
          communication: 'email',
          autoBooking: false
        });
        
        await connection.execute(
          `INSERT INTO pet_owners (id, name, email, preferences) 
           VALUES (?, ?, ?, ?)`,
          [petOwnerId, '', req.user.email, defaultPreferences]
        );
        
        profile = {
          id: petOwnerId,
          userId: petOwnerId,
          name: '',
          email: req.user.email || '',
          phone: '',
          address: '',
          emergencyContact: {
            name: '',
            phone: '',
            relationship: ''
          },
          preferences: safeJsonParse(defaultPreferences, {
            notifications: { email: true, sms: false, push: false },
            communication: 'email',
            autoBooking: false
          }),
          joinedDate: new Date().toISOString().split('T')[0],
          lastActiveDate: new Date().toISOString()
        };
      } else {
        const owner = ownerRows[0];
        profile = {
          id: owner.id,
          userId: owner.id,
          name: owner.name || '',
          email: owner.email || '',
          phone: owner.phone || '',
          address: owner.address || '',
          emergencyContact: {
            name: owner.emergencyContactName || '',
            phone: owner.emergencyContactPhone || '',
            relationship: owner.emergencyContactRelationship || ''
          },
          preferences: safeJsonParse(owner.preferences, {
            notifications: { email: true, sms: false, push: false },
            communication: 'email',
            autoBooking: false
          }),
          joinedDate: owner.createdAt ? owner.createdAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          lastActiveDate: owner.lastActiveDate ? owner.lastActiveDate.toISOString() : new Date().toISOString()
        };
      }

      res.json({
        success: true,
        data: profile
      });
      
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error getting pet owner profile:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get pet owner profile'
    });
  }
});

// PUT /api/pet-owners/profile - Update pet owner profile
router.put('/profile', verifyToken, requirePetOwner, async (req, res) => {
  try {
    const petOwnerId = req.user.uid;
    const {
      name,
      phone,
      address,
      emergencyContact,
      preferences
    } = req.body;

    const connection = await pool.getConnection();
    
    try {
      // Check if pet owner record exists
      const [existingOwner] = await connection.execute(
        'SELECT id FROM pet_owners WHERE id = ?',
        [petOwnerId]
      );

      if (existingOwner.length === 0) {
        // Create new pet owner record if it doesn't exist
        await connection.execute(
          `INSERT INTO pet_owners (id, name, email, phone, address, 
           emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
           preferences, lastActiveDate, createdAt, updatedAt) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            petOwnerId,
            name || '',
            req.user.email || '',
            phone || '',
            address || '',
            emergencyContact?.name || '',
            emergencyContact?.phone || '',
            emergencyContact?.relationship || '',
            JSON.stringify(preferences || {}),
            new Date()
          ]
        );
      } else {
        // Update existing pet owner record
        await connection.execute(
          `UPDATE pet_owners SET 
           name = ?, phone = ?, address = ?, 
           emergencyContactName = ?, emergencyContactPhone = ?, emergencyContactRelationship = ?,
           preferences = ?, lastActiveDate = ?, updatedAt = NOW()
           WHERE id = ?`,
          [
            name || '',
            phone || '',
            address || '',
            emergencyContact?.name || '',
            emergencyContact?.phone || '',
            emergencyContact?.relationship || '',
            JSON.stringify(preferences || {}),
            new Date(),
            petOwnerId
          ]
        );
      }

      const updatedProfile = {
        id: petOwnerId,
        userId: petOwnerId,
        name: name || '',
        email: req.user.email || '',
        phone: phone || '',
        address: address || '',
        emergencyContact: emergencyContact || {
          name: '',
          phone: '',
          relationship: ''
        },
        preferences: preferences || {
          notifications: {
            email: true,
            sms: false,
            push: false
          },
          communication: 'email',
          autoBooking: false
        },
        joinedDate: new Date().toISOString().split('T')[0],
        lastActiveDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: updatedProfile
      });
      
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error updating pet owner profile:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update profile'
    });
  }
});

// GET /api/pet-owners/pets - Get all pets for the pet owner
router.get('/pets', verifyToken, requirePetOwner, async (req, res) => {
  try {
    const petOwnerId = req.user.uid;
    const connection = await pool.getConnection();
    
    try {
      // Get all pets for the pet owner
      const [petsResult] = await connection.execute(
        'SELECT * FROM pets WHERE ownerId = ? ORDER BY createdAt DESC',
        [petOwnerId]
      );

      const pets = petsResult.map(pet => ({
        id: pet.id,
        ownerId: pet.ownerId,
        name: pet.name,
        type: pet.type,
        breed: pet.breed,
        age: pet.age,
        weight: pet.weight,
        gender: pet.gender,
        color: pet.color,
        microchipId: pet.microchipId,
        photos: safeJsonParse(pet.photos, []),
        medicalInfo: safeJsonParse(pet.medicalInfo, {
          allergies: [],
          medications: [],
          conditions: [],
          lastCheckup: ''
        }),
        behaviorNotes: pet.behaviorNotes || '',
        specialNeeds: pet.specialNeeds || '',
        createdAt: pet.createdAt,
        updatedAt: pet.updatedAt
      }));

      res.json({
        success: true,
        data: pets,
        count: pets.length
      });
      
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error getting pets:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get pets'
    });
  }
});

// GET /api/pet-owners/pets/:id - Get specific pet
router.get('/pets/:id', verifyToken, requirePetOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const petOwnerId = req.user.uid;
    const connection = await pool.getConnection();
    
    try {
      // Get specific pet owned by the user
      const [petResult] = await connection.execute(
        'SELECT * FROM pets WHERE id = ? AND ownerId = ?',
        [id, petOwnerId]
      );
      
      if (petResult.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Pet not found'
        });
      }
      
      const pet = petResult[0];
      const petData = {
        id: pet.id,
        ownerId: pet.ownerId,
        name: pet.name,
        type: pet.type,
        breed: pet.breed,
        age: pet.age,
        weight: pet.weight,
        gender: pet.gender,
        color: pet.color,
        microchipId: pet.microchipId,
        photos: safeJsonParse(pet.photos, []),
        medicalInfo: safeJsonParse(pet.medicalInfo, {}),
        behaviorNotes: pet.behaviorNotes || '',
        specialNeeds: pet.specialNeeds || '',
        createdAt: pet.createdAt,
        updatedAt: pet.updatedAt
      };

      res.json({
        success: true,
        data: petData
      });
      
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error getting pet:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get pet'
    });
  }
});

// POST /api/pet-owners/pets - Add a new pet
router.post('/pets', verifyToken, requirePetOwner, async (req, res) => {
  try {
    const petOwnerId = req.user.uid;
    const {
      name,
      type,
      breed,
      age,
      weight,
      gender,
      color,
      microchipId,
      photos,
      medicalInfo,
      behaviorNotes,
      specialNeeds
    } = req.body;

    // Validate required fields
    if (!name || !type || !breed) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Name, type, and breed are required'
      });
    }

    const connection = await pool.getConnection();
    
    try {
      // Ensure pet owner record exists (create if it doesn't)
      const [existingOwner] = await connection.execute(
        'SELECT id FROM pet_owners WHERE id = ?',
        [petOwnerId]
      );

      if (existingOwner.length === 0) {
        // Create pet owner record first if it doesn't exist
        const defaultPreferences = JSON.stringify({
          notifications: {
            email: true,
            sms: false,
            push: false
          },
          communication: 'email',
          autoBooking: false
        });
        
        await connection.execute(
          `INSERT INTO pet_owners (id, name, email, preferences, lastActiveDate, createdAt, updatedAt) 
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [petOwnerId, '', req.user.email, defaultPreferences, new Date()]
        );
      }

      const petId = `pet_${Date.now()}`;
      
      // Insert new pet into database
      await connection.execute(
        `INSERT INTO pets (id, ownerId, name, type, breed, age, weight, gender, color, microchipId, photos, medicalInfo, behaviorNotes, specialNeeds, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          petId,
          petOwnerId,
          name,
          type,
          breed,
          age || 0,
          weight || 0.00,
          gender || 'Unknown',
          color || 'Unknown',
          microchipId || '',
          JSON.stringify(photos || []),
          JSON.stringify(medicalInfo || {
            allergies: [],
            medications: [],
            conditions: [],
            lastCheckup: ''
          }),
          behaviorNotes || '',
          specialNeeds || ''
        ]
      );

      const newPet = {
        id: petId,
        ownerId: petOwnerId,
        name,
        type,
        breed,
        age: age || 0,
        weight: weight || 0.00,
        gender: gender || 'Unknown',
        color: color || 'Unknown',
        microchipId: microchipId || '',
        photos: photos || [],
        medicalInfo: medicalInfo || {
          allergies: [],
          medications: [],
          conditions: [],
          lastCheckup: ''
        },
        behaviorNotes: behaviorNotes || '',
        specialNeeds: specialNeeds || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      res.status(201).json({
        success: true,
        message: 'Pet added successfully',
        data: newPet
      });
      
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error adding pet:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add pet'
    });
  }
});

// PUT /api/pet-owners/pets/:id - Update pet information
router.put('/pets/:id', verifyToken, requirePetOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const petOwnerId = req.user.uid;
    const updateData = req.body;

    const connection = await pool.getConnection();
    
    try {
      // Check if pet exists and belongs to the user
      const [petCheck] = await connection.execute(
        'SELECT * FROM pets WHERE id = ? AND ownerId = ?',
        [id, petOwnerId]
      );
      
      if (petCheck.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Pet not found'
        });
      }

      // Update pet information
      const updateFields = [];
      const updateValues = [];
      
      if (updateData.name) { updateFields.push('name = ?'); updateValues.push(updateData.name); }
      if (updateData.type) { updateFields.push('type = ?'); updateValues.push(updateData.type); }
      if (updateData.breed) { updateFields.push('breed = ?'); updateValues.push(updateData.breed); }
      if (updateData.age) { updateFields.push('age = ?'); updateValues.push(updateData.age); }
      if (updateData.weight) { updateFields.push('weight = ?'); updateValues.push(updateData.weight); }
      if (updateData.gender) { updateFields.push('gender = ?'); updateValues.push(updateData.gender); }
      if (updateData.color) { updateFields.push('color = ?'); updateValues.push(updateData.color); }
      if (updateData.microchipId !== undefined) { updateFields.push('microchipId = ?'); updateValues.push(updateData.microchipId); }
      if (updateData.photos) { updateFields.push('photos = ?'); updateValues.push(JSON.stringify(updateData.photos)); }
      if (updateData.medicalInfo) { updateFields.push('medicalInfo = ?'); updateValues.push(JSON.stringify(updateData.medicalInfo)); }
      if (updateData.behaviorNotes !== undefined) { updateFields.push('behaviorNotes = ?'); updateValues.push(updateData.behaviorNotes); }
      if (updateData.specialNeeds !== undefined) { updateFields.push('specialNeeds = ?'); updateValues.push(updateData.specialNeeds); }
      
      updateFields.push('updatedAt = ?');
      updateValues.push(new Date());
      updateValues.push(id);
      updateValues.push(petOwnerId);

      await connection.execute(
        `UPDATE pets SET ${updateFields.join(', ')} WHERE id = ? AND ownerId = ?`,
        updateValues
      );

      // Get updated pet data
      const [updatedPetResult] = await connection.execute(
        'SELECT * FROM pets WHERE id = ? AND ownerId = ?',
        [id, petOwnerId]
      );
      
      const updatedPet = updatedPetResult[0];
      const petData = {
        id: updatedPet.id,
        ownerId: updatedPet.ownerId,
        name: updatedPet.name,
        type: updatedPet.type,
        breed: updatedPet.breed,
        age: updatedPet.age,
        weight: updatedPet.weight,
        gender: updatedPet.gender,
        color: updatedPet.color,
        microchipId: updatedPet.microchipId,
        photos: safeJsonParse(updatedPet.photos, []),
        medicalInfo: safeJsonParse(updatedPet.medicalInfo, {}),
        behaviorNotes: updatedPet.behaviorNotes || '',
        specialNeeds: updatedPet.specialNeeds || '',
        createdAt: updatedPet.createdAt,
        updatedAt: updatedPet.updatedAt
      };

      res.json({
        success: true,
        message: 'Pet updated successfully',
        data: petData
      });
      
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error updating pet:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update pet'
    });
  }
});

// DELETE /api/pet-owners/pets/:id - Delete a pet
router.delete('/pets/:id', verifyToken, requirePetOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const petOwnerId = req.user.uid;
    const connection = await pool.getConnection();
    
    try {
      // Check if pet exists and belongs to the user
      const [petCheck] = await connection.execute(
        'SELECT * FROM pets WHERE id = ? AND ownerId = ?',
        [id, petOwnerId]
      );
      
      if (petCheck.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Pet not found'
        });
      }

      // Delete the pet
      await connection.execute(
        'DELETE FROM pets WHERE id = ? AND ownerId = ?',
        [id, petOwnerId]
      );

      res.json({
        success: true,
        message: 'Pet deleted successfully'
      });
      
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error deleting pet:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete pet'
    });
  }
});

// GET /api/pet-owners/bookings - Get booking history for pet owner
router.get('/bookings', verifyToken, requirePetOwner, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const petOwnerId = req.user.uid;
    const connection = await pool.getConnection();

    try {
      // Build the query with filters
      let query = `
        SELECT b.*, 
               s.name as serviceName, 
               s.price as servicePrice,
               c.name as companyName,
               c.phone as companyPhone,
               c.address as companyAddress,
               p.name as petName,
               p.type as petType
        FROM bookings b
        LEFT JOIN services s ON b.serviceId = s.id
        LEFT JOIN companies c ON b.companyId = c.id
        LEFT JOIN pets p ON b.petId = p.id
        WHERE b.petOwnerId = ?
      `;
      
      const queryParams = [petOwnerId];
      
      // Apply status filter
      if (status) {
        query += ' AND b.status = ?';
        queryParams.push(status);
      }
      
      // Add sorting
      query += ' ORDER BY b.date DESC, b.time DESC';
      
      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) as total FROM bookings b WHERE b.petOwnerId = ?';
      const countParams = [petOwnerId];
    
      if (status) {
        countQuery += ' AND b.status = ?';
        countParams.push(status);
      }
      
      const [countResult] = await connection.execute(countQuery, countParams);
      const totalBookings = countResult[0].total;
      
      // Add pagination
      const offset = (page - 1) * limit;
      query += ` LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
      
      const [bookingsResult] = await connection.execute(query, queryParams);
      
      const userBookings = bookingsResult.map(booking => ({
        id: booking.id,
        companyId: booking.companyId,
        companyName: booking.companyName,
        companyPhone: booking.companyPhone,
        companyAddress: booking.companyAddress,
        serviceId: booking.serviceId,
        serviceName: booking.serviceName,
        servicePrice: parseFloat(booking.servicePrice),
        petId: booking.petId,
        petName: booking.petName,
        petType: booking.petType,
        date: booking.date,
        time: booking.time,
        status: booking.status,
        notes: booking.notes,
        specialRequirements: booking.specialRequirements,
        totalAmount: parseFloat(booking.totalAmount),
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt
      }));

      res.json({
        success: true,
        data: userBookings,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalBookings / limit),
          totalBookings: totalBookings,
          limit: parseInt(limit)
        }
      });
      
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error getting bookings:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get bookings'
    });
  }
});

// POST /api/pet-owners/bookings - Create a new booking
router.post('/bookings', verifyToken, requirePetOwner, async (req, res) => {
  try {
    const petOwnerId = req.user.uid;
    const {
      companyId,
      serviceId,
      petId,
      date,
      time,
      notes,
      specialRequirements: _specialRequirements // eslint-disable-line no-unused-vars
    } = req.body;

    // Validate required fields
    if (!companyId || !serviceId || !petId || !date || !time) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Company, service, pet, date, and time are required'
      });
    }

    const connection = await pool.getConnection();
    
    try {
      // Verify that the pet belongs to the user
      const [petCheck] = await connection.execute(
        'SELECT * FROM pets WHERE id = ? AND ownerId = ?',
        [petId, petOwnerId]
      );
      
      if (petCheck.length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Pet not found or does not belong to you'
        });
      }

      // Get service price
      const [serviceResult] = await connection.execute(
        'SELECT price FROM services WHERE id = ? AND companyId = ?',
        [serviceId, companyId]
      );
      
      if (serviceResult.length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Service not found'
        });
      }

      const bookingId = `booking_${Date.now()}`;
      const servicePrice = parseFloat(serviceResult[0].price);

      // Create new booking
      await connection.execute(
        `INSERT INTO bookings (id, petOwnerId, companyId, serviceId, petId, date, time, status, notes, totalAmount, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          bookingId,
          petOwnerId,
          companyId,
          serviceId,
          petId,
          date,
          time,
          'pending',
          notes || '',
          servicePrice,
          new Date(),
          new Date()
        ]
      );

      const newBooking = {
        id: bookingId,
        petOwnerId,
        companyId,
        serviceId,
        petId,
        date,
        time,
        status: 'pending',
        notes: notes || '',
        totalAmount: servicePrice,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      res.status(201).json({
        success: true,
        message: 'Booking created successfully',
        data: newBooking
      });
      
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create booking'
    });
  }
});

// GET /api/pet-owners/dashboard - Get pet owner dashboard data
router.get('/dashboard', verifyToken, requirePetOwner, async (req, res) => {
  try {
    const petOwnerId = req.user.uid;
    const connection = await pool.getConnection();
    
    try {
      // Get total pets count
      const [petsResult] = await connection.execute(
        'SELECT COUNT(*) as total FROM pets WHERE ownerId = ?',
        [petOwnerId]
      );
      
      // Get upcoming bookings count (next 30 days)
      const [upcomingBookingsResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM bookings 
         WHERE petOwnerId = ? AND date >= CURDATE() AND date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
         AND status NOT IN ('cancelled', 'completed')`,
        [petOwnerId]
      );
      
      // Get total bookings count
      const [totalBookingsResult] = await connection.execute(
        'SELECT COUNT(*) as total FROM bookings WHERE petOwnerId = ?',
        [petOwnerId]
      );
      
      // Get favorite companies count (companies where user has booked more than once)
      const [favoriteCompaniesResult] = await connection.execute(
        `SELECT COUNT(DISTINCT companyId) as total FROM bookings 
         WHERE petOwnerId = ? 
         GROUP BY companyId 
         HAVING COUNT(*) > 1`,
        [petOwnerId]
      );
      
      // Get recent activity (last 10 bookings)
      const [recentActivityResult] = await connection.execute(
        `SELECT b.*, s.name as serviceName, c.name as companyName, p.name as petName
         FROM bookings b
         LEFT JOIN services s ON b.serviceId = s.id
         LEFT JOIN companies c ON b.companyId = c.id
         LEFT JOIN pets p ON b.petId = p.id
         WHERE b.petOwnerId = ?
         ORDER BY b.createdAt DESC
         LIMIT 10`,
        [petOwnerId]
      );
      
      // Get upcoming appointments (next 7 days)
      const [upcomingAppointmentsResult] = await connection.execute(
        `SELECT b.*, s.name as serviceName, c.name as companyName, p.name as petName
         FROM bookings b
         LEFT JOIN services s ON b.serviceId = s.id
         LEFT JOIN companies c ON b.companyId = c.id
         LEFT JOIN pets p ON b.petId = p.id
         WHERE b.petOwnerId = ? AND b.date >= CURDATE() AND b.date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
         AND b.status NOT IN ('cancelled', 'completed')
         ORDER BY b.date ASC, b.time ASC`,
        [petOwnerId]
      );

      const dashboardData = {
        totalPets: petsResult[0].total || 0,
        upcomingBookings: upcomingBookingsResult[0].total || 0,
        totalBookings: totalBookingsResult[0].total || 0,
        favoriteCompanies: favoriteCompaniesResult.length || 0,
        recentActivity: recentActivityResult.map(activity => ({
          id: activity.id,
          type: 'booking',
          description: `Booked ${activity.serviceName} for ${activity.petName} at ${activity.companyName}`,
          date: activity.createdAt,
          status: activity.status
        })),
        upcomingAppointments: upcomingAppointmentsResult.map(appointment => ({
          id: appointment.id,
          serviceName: appointment.serviceName,
          companyName: appointment.companyName,
          petName: appointment.petName,
          date: appointment.date,
          time: appointment.time,
          status: appointment.status
        })),
        petHealthReminders: [] // This could be enhanced to track vaccination dates, checkups, etc.
      };

      res.json({
        success: true,
        data: dashboardData
      });
      
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get dashboard data'
    });
  }
});

// GET /api/pet-owners/dashboard-stats - Get dashboard statistics for pet owner
router.get('/dashboard-stats', verifyToken, requirePetOwner, async (req, res) => {
  try {
    const petOwnerId = req.user.uid;
    const connection = await pool.getConnection();
    
    try {
      // Get total pets count
      const [petsCountResult] = await connection.execute(
        'SELECT COUNT(*) as total FROM pets WHERE ownerId = ?',
        [petOwnerId]
      );
      
      // Get total bookings count
      const [totalBookingsResult] = await connection.execute(
        'SELECT COUNT(*) as total FROM bookings WHERE petOwnerId = ?',
        [petOwnerId]
      );
      
      // Get upcoming bookings count
      const [upcomingBookingsResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM bookings 
         WHERE petOwnerId = ? AND status IN ('pending', 'confirmed') 
         AND date >= CURDATE()`,
        [petOwnerId]
      );
      
      // Get favorite companies count (companies the user has booked with)
      const [favoriteCompaniesResult] = await connection.execute(
        `SELECT COUNT(DISTINCT companyId) as total FROM bookings 
         WHERE petOwnerId = ?`,
        [petOwnerId]
      );
      
      // Get recent activity (last 5 bookings)
      const [recentActivityResult] = await connection.execute(
        `SELECT b.*, s.name as serviceName, c.name as companyName, p.name as petName
         FROM bookings b
         LEFT JOIN services s ON b.serviceId = s.id
         LEFT JOIN companies c ON b.companyId = c.id
         LEFT JOIN pets p ON b.petId = p.id
         WHERE b.petOwnerId = ?
         ORDER BY b.createdAt DESC
         LIMIT 5`,
        [petOwnerId]
      );
      
      // Get upcoming appointments (next 10 appointments)
      const [upcomingAppointmentsResult] = await connection.execute(
        `SELECT b.*, s.name as serviceName, c.name as companyName, p.name as petName
         FROM bookings b
         LEFT JOIN services s ON b.serviceId = s.id
         LEFT JOIN companies c ON b.companyId = c.id
         LEFT JOIN pets p ON b.petId = p.id
         WHERE b.petOwnerId = ? AND status IN ('pending', 'confirmed')
         AND date >= CURDATE()
         ORDER BY b.date ASC, b.time ASC
         LIMIT 10`,
        [petOwnerId]
      );
      
      // Format recent activity
      const recentActivity = recentActivityResult.map(activity => {
        let icon = '📅';
        let message = '';
        
        switch(activity.status) {
          case 'confirmed':
            icon = '✅';
            message = `Booking confirmed for ${activity.petName ? activity.petName + "'s" : ''} ${activity.serviceName}`;
            break;
          case 'completed':
            icon = '🎉';
            message = `${activity.serviceName} completed for ${activity.petName}`;
            break;
          case 'cancelled':
            icon = '❌';
            message = `Booking cancelled for ${activity.serviceName}`;
            break;
          default:
            message = `Booking ${activity.status} for ${activity.serviceName}`;
        }
        
        return {
          id: activity.id,
          type: `booking_${activity.status}`,
          message: message,
          date: activity.createdAt ? activity.createdAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          icon: icon
        };
      });
      
      // Format upcoming appointments
      const upcomingAppointments = upcomingAppointmentsResult.map(appointment => ({
        id: appointment.id,
        serviceName: appointment.serviceName || 'Service',
        companyName: appointment.companyName || 'Company',
        petName: appointment.petName || 'Pet',
        date: appointment.date ? appointment.date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        time: appointment.time || '10:00 AM',
        status: appointment.status
      }));
      
      // Mock health reminders for now (since we don't have a health reminders table yet)
      const petHealthReminders = [];
      
      const dashboardStats = {
        totalPets: petsCountResult[0].total || 0,
        totalBookings: totalBookingsResult[0].total || 0,
        upcomingBookings: upcomingBookingsResult[0].total || 0,
        favoriteCompanies: favoriteCompaniesResult[0].total || 0,
        recentActivity: recentActivity,
        upcomingAppointments: upcomingAppointments,
        petHealthReminders: petHealthReminders
      };

      res.json({
        success: true,
        data: dashboardStats
      });
      
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error getting pet owner dashboard stats:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get dashboard statistics'
    });
  }
});

// POST /api/pet-owners/pets/upload-photos - Upload pet photos
router.post('/pets/upload-photos', verifyToken, requirePetOwner, uploadPetPhoto.array('photos', 5), async (req, res) => {
  console.log('Upload route hit - Content-Type:', req.get('Content-Type'));
  console.log('Files received:', req.files ? req.files.length : 0);
  console.log('Body:', req.body);
  
  try {
    if (!req.files || req.files.length === 0) {
      console.log('No files found in request');
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No photos uploaded'
      });
    }

    // Process uploaded files and return their URLs
    const uploadedPhotos = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      url: getFileUrl(file.filename),
      size: file.size
    }));

    res.json({
      success: true,
      message: 'Photos uploaded successfully',
      data: uploadedPhotos
    });

  } catch (error) {
    console.error('Error uploading pet photos:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        deleteFile(file.filename);
      });
    }
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to upload photos'
    });
  }
});

// DELETE /api/pet-owners/pets/delete-photo/:filename - Delete pet photo
router.delete('/pets/delete-photo/:filename', verifyToken, requirePetOwner, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent directory traversal
    if (!filename || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid filename'
      });
    }

    const deleted = deleteFile(filename);
    
    if (deleted) {
      res.json({
        success: true,
        message: 'Photo deleted successfully'
      });
    } else {
      res.status(404).json({
        error: 'Not Found',
        message: 'Photo not found'
      });
    }

  } catch (error) {
    console.error('Error deleting pet photo:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete photo'
    });
  }
});

export default router;