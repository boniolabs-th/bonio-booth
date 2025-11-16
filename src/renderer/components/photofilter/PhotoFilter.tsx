/* eslint-disable jsx-a11y/img-redundant-alt */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { FrameConfig, FILTERS } from '../../utils/frameConfig';
import './PhotoFilter.css';

interface Capture {
  video: string;
  photo: string;
}

interface LocationState {
  quantity: number;
  totalPrice: number;
  captures: Capture[];
  finalImage: string;
  selectedFrame: FrameConfig;
  selectedCaptures: Capture[];
}

export default function PhotoFilter() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number>(0);
  const [selectedFilter, setSelectedFilter] = useState<string>('none');

  const handlePrint = () => {
    navigate('/photo-result', {
      state: {
        ...state,
        selectedFilter,
      },
    });
  };

  const handlePhotoClick = (index: number) => {
    setSelectedPhotoIndex(index);
  };

  const handleFilterClick = (filterId: string) => {
    setSelectedFilter(filterId);
  };

  const getCurrentImage = () => {
    if (state.finalImage) {
      return state.finalImage;
    }
    return state.selectedCaptures[selectedPhotoIndex]?.photo || '';
  };

  const getSelectedFilterStyle = () => {
    const filter = FILTERS.find((f) => f.id === selectedFilter);
    return filter?.filter || '';
  };

  return (
    <div className="photo-filter-container">
      {/* Header */}
      <div className="filter-header">
        <h1 className="filter-title">ตกแต่งรูปของคุณ</h1>
        <p className="filter-subtitle">DECORATE YOUR PHOTO</p>
      </div>

      {/* Main Layout */}
      <div className="filter-main">
        {/* Left - Photo Strip */}
        <div className="photo-strip-section">

          {/* Filter Preview Section */}
          {state.selectedCaptures.length > 0 && (
            <div className="filter-preview-section">
              <div className="filter-preview-title">เลือก Filter</div>
              <div className="filter-preview-grid">
                {FILTERS.map((filter) => {
                  const getFilterStyle = (filterId: string) => {
                    const f = FILTERS.find((fl) => fl.id === filterId);
                    return f?.filter || '';
                  };

                  return (
                    <button
                      key={filter.id}
                      type="button"
                      className={`filter-preview-item ${
                        selectedFilter === filter.id ? 'active' : ''
                      }`}
                      onClick={() => handleFilterClick(filter.id)}
                    >
                      <div className="filter-preview-image">
                        <img
                          src={state.selectedCaptures[0].photo}
                          alt={filter.name}
                          style={{ filter: getFilterStyle(filter.id) }}
                        />
                      </div>
                      <div className="filter-preview-name">{filter.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right - Canvas Area */}
        <div className="canvas-section">
          <div className="canvas-container">
            {getCurrentImage() && (
              <img
                src={getCurrentImage()}
                alt="Photo to decorate"
                className="canvas-image"
                style={{ filter: getSelectedFilterStyle() }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Bottom Button */}
      <div className="filter-footer">
        <button type="button" className="print-button" onClick={handlePrint}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          พิมพ์รูปภาพ
        </button>
      </div>
    </div>
  );
}

