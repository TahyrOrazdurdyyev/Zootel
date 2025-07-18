import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authenticatedApiCall } from '../../utils/api';
import './MyPets.css';

const MyPets = () => {
  const { currentUser } = useAuth();
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedPet, setSelectedPet] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const [formData, setFormData] = useState({
    name: '',
    type: 'Dog',
    breed: '',
    age: '',
    weight: '',
    gender: 'Male',
    color: '',
    microchipId: '',
    photos: [],
    medicalInfo: {
      allergies: [],
      medications: [],
      conditions: [],

      lastCheckup: ''
    },
    behaviorNotes: '',
    specialNeeds: ''
  });

  const petTypes = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Hamster', 'Guinea Pig', 'Fish', 'Reptile', 'Other'];
  const genders = ['Male', 'Female', 'Unknown'];

  const fetchPets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedApiCall(currentUser, '/api/pet-owners/pets');

      if (response.ok) {
        const data = await response.json();
        setPets(data.data || []);
      } else {
        setError('Failed to load pets');
      }
    } catch (error) {
      console.error('Error fetching pets:', error);
      setError('Error loading pets');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchPets();
  }, [fetchPets]);

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'Dog',
      breed: '',
      age: '',
      weight: '',
      gender: 'Male',
      color: '',
      microchipId: '',
      photos: [],
      medicalInfo: {
        allergies: [],
        medications: [],
        conditions: [],
        lastCheckup: ''
      },
      behaviorNotes: '',
      specialNeeds: ''
    });
    setSelectedFiles([]);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 5) {
      setError('Maximum 5 photos allowed');
      return;
    }
    
    // Validate file types and sizes
    const validFiles = files.filter(file => {
      const isValidType = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type);
      const isValidSize = file.size <= 5 * 1024 * 1024; // 5MB
      
      if (!isValidType) {
        setError('Only JPEG, PNG, and WebP images are allowed');
        return false;
      }
      if (!isValidSize) {
        setError('File size must be less than 5MB');
        return false;
      }
      return true;
    });

    setSelectedFiles(validFiles);
    setError('');
  };

  const uploadPhotos = async () => {
    if (selectedFiles.length === 0) return [];

    setPhotoUploading(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('photos', file);
      });

      const response = await authenticatedApiCall(currentUser, '/api/pet-owners/pets/upload-photos', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        return result.data.map(photo => photo.url);
      } else {
        throw new Error('Failed to upload photos');
      }
    } catch (error) {
      console.error('Error uploading photos:', error);
      setError('Failed to upload photos');
      return [];
    } finally {
      setPhotoUploading(false);
    }
  };

  const removePhoto = (index) => {
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleArrayChange = (field, value) => {
    const array = value.split(',').map(item => item.trim()).filter(item => item);
    setFormData(prev => ({
      ...prev,
      medicalInfo: {
        ...prev.medicalInfo,
        [field]: array
      }
    }));
  };

  const openAddModal = () => {
    console.log('🐾 Add Pet button clicked');
    console.log('🔍 Current user:', currentUser ? 'Authenticated' : 'Not authenticated');
    console.log('📝 Before - showAddModal:', showAddModal);
    
    resetForm();
    setShowAddModal(true);
    setError('');
    
    console.log('✅ Modal state updated - showAddModal should be true');
    console.log('📋 Form data after reset:', formData);
  };

  const openEditModal = (pet) => {
    setSelectedPet(pet);
    setFormData({
      ...pet,
      medicalInfo: {
        allergies: pet.medicalInfo?.allergies || [],
        medications: pet.medicalInfo?.medications || [],
        conditions: pet.medicalInfo?.conditions || [],

        lastCheckup: pet.medicalInfo?.lastCheckup || ''
      }
    });
    setShowEditModal(true);
    setError('');
  };

  const openDeleteConfirm = (pet) => {
    setSelectedPet(pet);
    setShowDeleteConfirm(true);
  };

  const closeModals = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setShowDeleteConfirm(false);
    setSelectedPet(null);
    setSelectedFiles([]);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.type || !formData.breed) {
      setError('Name, type, and breed are required');
      return;
    }

    setFormLoading(true);
    setError('');

    try {
      // Upload new photos if any are selected
      let uploadedPhotoUrls = [];
      if (selectedFiles.length > 0) {
        uploadedPhotoUrls = await uploadPhotos();
        if (selectedFiles.length > 0 && uploadedPhotoUrls.length === 0) {
          // If upload failed, stop submission
          setFormLoading(false);
          return;
        }
      }

      // Combine existing photos with newly uploaded ones
      const allPhotos = [...formData.photos, ...uploadedPhotoUrls];

      const petData = {
        ...formData,
        photos: allPhotos
      };

      const url = showEditModal ? `/api/pet-owners/pets/${selectedPet.id}` : '/api/pet-owners/pets';
      const method = showEditModal ? 'PUT' : 'POST';

      const response = await authenticatedApiCall(currentUser, url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(petData)
      });

      if (response.ok) {
        await fetchPets(); // Refresh pets list
        closeModals();
      } else {
        const errorData = await response.json();
        setError(errorData.message || `Failed to ${showEditModal ? 'update' : 'add'} pet`);
      }
    } catch (error) {
      console.error('Error submitting pet:', error);
      setError(`Error ${showEditModal ? 'updating' : 'adding'} pet`);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    setFormLoading(true);
    try {
      const response = await authenticatedApiCall(currentUser, `/api/pet-owners/pets/${selectedPet.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchPets(); // Refresh pets list
        closeModals();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to delete pet');
      }
    } catch (error) {
      console.error('Error deleting pet:', error);
      setError('Error deleting pet');
    } finally {
      setFormLoading(false);
    }
  };

  const getPetIcon = (type) => {
    const icons = {
      Dog: '🐕',
      Cat: '🐱',
      Bird: '🐦',
      Rabbit: '🐰',
      Hamster: '🐹',
      'Guinea Pig': '🐹',
      Fish: '🐠',
      Reptile: '🦎',
      Other: '🐾'
    };
    return icons[type] || icons.Other;
  };

  if (loading) {
    return (
      <div className="pets-loading">
        <div className="loading-spinner"></div>
        <p>Loading your pets...</p>
      </div>
    );
  }

  return (
    <div className="my-pets">
      <div className="pets-header">
        <h2>My Pets</h2>
        <button className="add-pet-btn" onClick={openAddModal}>
          <span className="btn-icon">+</span>
          Add Pet
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {pets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🐾</div>
          <h3>No pets yet</h3>
          <p>Add your first pet to get started with managing their profiles and booking services.</p>
          <button className="cta-button" onClick={openAddModal}>
            Add Your First Pet
          </button>
        </div>
      ) : (
        <div className="pets-grid">
          {pets.map(pet => (
            <div key={pet.id} className="pet-card">
              <div className="pet-avatar">
                {getPetIcon(pet.type)}
              </div>
              
              <div className="pet-info">
                <h3 className="pet-name">{pet.name}</h3>
                <p className="pet-details">{pet.breed} • {pet.age}</p>
                <p className="pet-type">{pet.type} • {pet.gender}</p>
                
                {pet.specialNeeds && (
                  <div className="special-needs">
                    <span className="needs-icon">⚠️</span>
                    <span className="needs-text">Special needs</span>
                  </div>
                )}
              </div>

              <div className="pet-actions">
                <button 
                  className="action-btn edit"
                  onClick={() => openEditModal(pet)}
                  title="Edit pet"
                >
                  ✏️
                </button>
                <button 
                  className="action-btn delete"
                  onClick={() => openDeleteConfirm(pet)}
                  title="Delete pet"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Pet Modal */}
      {(showAddModal || showEditModal) && (
        <div className="modal-overlay" onClick={closeModals}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{showEditModal ? 'Edit Pet' : 'Add New Pet'}</h3>
              <button className="close-btn" onClick={closeModals}>×</button>
            </div>

            <form onSubmit={handleSubmit} className="pet-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">Pet Name *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="type">Type *</label>
                  <select
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    required
                  >
                    {petTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="breed">Breed *</label>
                  <input
                    type="text"
                    id="breed"
                    name="breed"
                    value={formData.breed}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="gender">Gender</label>
                  <select
                    id="gender"
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                  >
                    {genders.map(gender => (
                      <option key={gender} value={gender}>{gender}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="age">Age</label>
                  <input
                    type="text"
                    id="age"
                    name="age"
                    value={formData.age}
                    onChange={handleInputChange}
                    placeholder="e.g., 3 years, 6 months"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="weight">Weight</label>
                  <input
                    type="text"
                    id="weight"
                    name="weight"
                    value={formData.weight}
                    onChange={handleInputChange}
                    placeholder="e.g., 25 lbs, 5 kg"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="color">Color</label>
                  <input
                    type="text"
                    id="color"
                    name="color"
                    value={formData.color}
                    onChange={handleInputChange}
                    placeholder="e.g., Golden, Black & White"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="microchipId">Microchip ID</label>
                  <input
                    type="text"
                    id="microchipId"
                    name="microchipId"
                    value={formData.microchipId}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="form-section">
                <h4>Pet Photos</h4>
                
                <div className="form-group">
                  <label htmlFor="photos">Upload Photos (Max 5 photos, 5MB each)</label>
                  <input
                    type="file"
                    id="photos"
                    multiple
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleFileSelect}
                    className="file-input"
                  />
                  <div className="file-input-help">
                    Supported formats: JPEG, PNG, WebP. Maximum 5 photos, 5MB each.
                  </div>
                </div>

                {/* Show selected files for upload */}
                {selectedFiles.length > 0 && (
                  <div className="selected-files">
                    <h5>Selected Photos for Upload:</h5>
                    <div className="files-preview">
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="file-preview">
                          <img 
                            src={URL.createObjectURL(file)} 
                            alt={`Preview ${index + 1}`}
                            className="file-preview-image"
                          />
                          <div className="file-info">
                            <span className="file-name">{file.name}</span>
                            <span className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                          </div>
                          <button 
                            type="button" 
                            className="remove-file-btn"
                            onClick={() => removeSelectedFile(index)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Show existing photos */}
                {formData.photos.length > 0 && (
                  <div className="existing-photos">
                    <h5>Current Photos:</h5>
                    <div className="photos-grid">
                      {formData.photos.map((photo, index) => (
                        <div key={index} className="photo-item">
                          <img 
                            src={`${process.env.REACT_APP_API_URL || 'https://zootel.shop'}${photo}`} 
                            alt={`Pet photo ${index + 1}`}
                            className="pet-photo"
                          />
                          <button 
                            type="button" 
                            className="remove-photo-btn"
                            onClick={() => removePhoto(index)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {photoUploading && (
                  <div className="upload-status">
                    <span className="uploading-text">Uploading photos...</span>
                  </div>
                )}
              </div>

              <div className="form-section">
                <h4>Medical Information</h4>
                
                <div className="form-group">
                  <label htmlFor="allergies">Allergies (comma-separated)</label>
                  <input
                    type="text"
                    id="allergies"
                    value={formData.medicalInfo.allergies.join(', ')}
                    onChange={(e) => handleArrayChange('allergies', e.target.value)}
                    placeholder="e.g., chicken, wheat, pollen"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="medications">Current Medications (comma-separated)</label>
                  <input
                    type="text"
                    id="medications"
                    value={formData.medicalInfo.medications.join(', ')}
                    onChange={(e) => handleArrayChange('medications', e.target.value)}
                    placeholder="e.g., heartworm prevention, vitamins"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="conditions">Medical Conditions (comma-separated)</label>
                  <input
                    type="text"
                    id="conditions"
                    value={formData.medicalInfo.conditions.join(', ')}
                    onChange={(e) => handleArrayChange('conditions', e.target.value)}
                    placeholder="e.g., diabetes, arthritis"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="lastCheckup">Last Checkup Date</label>
                  <input
                    type="date"
                    id="lastCheckup"
                    name="medicalInfo.lastCheckup"
                    value={formData.medicalInfo.lastCheckup}
                    onChange={handleInputChange}
                  />
                </div>
              </div>



              <div className="form-group">
                <label htmlFor="behaviorNotes">Behavior Notes</label>
                <textarea
                  id="behaviorNotes"
                  name="behaviorNotes"
                  value={formData.behaviorNotes}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Describe your pet's temperament, likes, dislikes..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="specialNeeds">Special Needs</label>
                <textarea
                  id="specialNeeds"
                  name="specialNeeds"
                  value={formData.specialNeeds}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Any special care requirements or instructions..."
                />
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={closeModals}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={formLoading}>
                  {formLoading ? 'Saving...' : (showEditModal ? 'Update Pet' : 'Add Pet')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={closeModals}>
          <div className="modal delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete Pet</h3>
              <button className="close-btn" onClick={closeModals}>×</button>
            </div>

            <div className="delete-content">
              <div className="warning-icon">⚠️</div>
              <p>Are you sure you want to delete <strong>{selectedPet?.name}</strong>?</p>
              <p className="warning-text">This action cannot be undone.</p>

              {error && <div className="error-message">{error}</div>}

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={closeModals}>
                  Cancel
                </button>
                <button 
                  className="delete-btn" 
                  onClick={handleDelete}
                  disabled={formLoading}
                >
                  {formLoading ? 'Deleting...' : 'Delete Pet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyPets; 